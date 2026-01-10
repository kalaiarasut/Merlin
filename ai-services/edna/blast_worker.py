"""
BLAST Background Worker

Production-ready async BLAST processing:
- Polls MongoDB for pending jobs
- Processes sequences via NCBI BLAST
- Updates job status in real-time
- Emits WebSocket notifications on completion

Run as separate process:
    python -m edna.blast_worker
"""

import asyncio
import os
import sys
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
import aiohttp
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from edna.edna_processor import EdnaProcessor, SequenceRecord

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('blast_worker')


class BlastJobWorker:
    """
    Background worker for processing BLAST jobs.
    
    Features:
    - Async job polling with configurable interval
    - Graceful error handling with retries
    - WebSocket notifications via backend API
    - Concurrent job processing (configurable)
    """
    
    def __init__(
        self,
        mongodb_uri: str = None,
        backend_url: str = None,
        poll_interval: int = 5,
        max_concurrent: int = 2
    ):
        self.mongodb_uri = mongodb_uri or os.getenv('MONGODB_URI', 'mongodb://localhost:27017/cmlre')
        self.backend_url = backend_url or os.getenv('BACKEND_URL', 'http://localhost:5000')
        self.poll_interval = poll_interval
        self.max_concurrent = max_concurrent
        
        self.client: Optional[AsyncIOMotorClient] = None
        self.db = None
        self.running = False
        self.processor = EdnaProcessor()
        self.active_jobs = 0
    
    async def connect(self):
        """Connect to MongoDB."""
        logger.info(f"Connecting to MongoDB: {self.mongodb_uri}")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client.get_default_database()
        
        # Verify connection
        await self.client.admin.command('ping')
        logger.info("MongoDB connected successfully")
    
    async def disconnect(self):
        """Disconnect from MongoDB."""
        if self.client:
            self.client.close()
            logger.info("MongoDB disconnected")
    
    async def poll_jobs(self):
        """Main polling loop for pending jobs."""
        self.running = True
        logger.info(f"Starting job polling (interval: {self.poll_interval}s, max concurrent: {self.max_concurrent})")
        
        while self.running:
            try:
                if self.active_jobs < self.max_concurrent:
                    job = await self.claim_next_job()
                    if job:
                        # Process job in background
                        asyncio.create_task(self.process_job(job))
                
                await asyncio.sleep(self.poll_interval)
                
            except Exception as e:
                logger.error(f"Polling error: {e}")
                await asyncio.sleep(self.poll_interval * 2)
    
    async def claim_next_job(self) -> Optional[Dict]:
        """
        Atomically claim the next pending job.
        Uses findAndModify to prevent duplicate processing.
        """
        result = await self.db.blastjobs.find_one_and_update(
            {
                'status': 'pending',
                '$or': [
                    {'retryCount': {'$lt': 3}},
                    {'retryCount': {'$exists': False}}
                ]
            },
            {
                '$set': {
                    'status': 'processing',
                    'startedAt': datetime.utcnow(),
                    'stage': 'initializing'
                }
            },
            sort=[('submittedAt', 1)],  # FIFO order
            return_document=True
        )
        
        if result:
            logger.info(f"Claimed job: {result['_id']}")
            self.active_jobs += 1
        
        return result
    
    async def process_job(self, job: Dict):
        """Process a single BLAST job."""
        job_id = str(job['_id'])
        
        try:
            sequences = job.get('sequences', [])
            database = job.get('database', 'nt')
            max_results = job.get('maxResults', 5)
            
            if not sequences:
                raise ValueError("No sequences provided")
            
            logger.info(f"Processing job {job_id}: {len(sequences)} sequences")
            
            all_detections = []
            
            for i, seq_data in enumerate(sequences):
                # Update progress
                progress = int((i / len(sequences)) * 100)
                await self.update_job_progress(
                    job_id,
                    progress=progress,
                    current_sequence=i + 1,
                    stage=f"Running BLAST for sequence {i + 1}/{len(sequences)}"
                )
                
                # Create SequenceRecord
                seq_record = SequenceRecord(
                    id=seq_data['id'],
                    sequence=seq_data['sequence'],
                    length=seq_data.get('length', len(seq_data['sequence'])),
                    gc_content=self.processor._calculate_gc(seq_data['sequence'])
                )
                
                # Run BLAST
                try:
                    detections = self.processor.run_blast(
                        [seq_record],
                        database=database,
                        max_results=max_results,
                        max_sequences=1
                    )
                    
                    for detection in detections:
                        all_detections.append({
                            'sequenceId': seq_data['id'],
                            'species': detection.species,
                            'confidence': detection.confidence,
                            'eValue': detection.e_value,
                            'identity': detection.identity,
                            'method': detection.method,
                            'taxonomy': detection.taxonomy or {}
                        })
                        
                except Exception as e:
                    logger.warning(f"BLAST failed for sequence {seq_data['id']}: {e}")
                    # Continue with other sequences
            
            # Mark job as completed
            await self.complete_job(job_id, all_detections)
            
            # Send WebSocket notification
            await self.notify_completion(job['userId'], job_id, len(all_detections))
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            await self.fail_job(job_id, str(e))
            
        finally:
            self.active_jobs -= 1
    
    async def update_job_progress(
        self,
        job_id: str,
        progress: int,
        current_sequence: int,
        stage: str
    ):
        """Update job progress in database."""
        from bson import ObjectId
        
        await self.db.blastjobs.update_one(
            {'_id': ObjectId(job_id)},
            {
                '$set': {
                    'progress': progress,
                    'currentSequence': current_sequence,
                    'stage': stage,
                    'updatedAt': datetime.utcnow()
                }
            }
        )
    
    async def complete_job(self, job_id: str, detections: List[Dict]):
        """Mark job as completed with results."""
        from bson import ObjectId
        
        await self.db.blastjobs.update_one(
            {'_id': ObjectId(job_id)},
            {
                '$set': {
                    'status': 'completed',
                    'progress': 100,
                    'stage': 'completed',
                    'detections': detections,
                    'completedAt': datetime.utcnow(),
                    'updatedAt': datetime.utcnow()
                }
            }
        )
        logger.info(f"Job {job_id} completed with {len(detections)} detections")
    
    async def fail_job(self, job_id: str, error: str):
        """Mark job as failed or retry."""
        from bson import ObjectId
        
        job = await self.db.blastjobs.find_one({'_id': ObjectId(job_id)})
        retry_count = job.get('retryCount', 0) + 1
        max_retries = job.get('maxRetries', 3)
        
        if retry_count < max_retries:
            # Retry later
            await self.db.blastjobs.update_one(
                {'_id': ObjectId(job_id)},
                {
                    '$set': {
                        'status': 'pending',
                        'stage': 'queued_for_retry',
                        'error': error,
                        'retryCount': retry_count,
                        'updatedAt': datetime.utcnow()
                    }
                }
            )
            logger.info(f"Job {job_id} queued for retry ({retry_count}/{max_retries})")
        else:
            # Max retries reached
            await self.db.blastjobs.update_one(
                {'_id': ObjectId(job_id)},
                {
                    '$set': {
                        'status': 'failed',
                        'stage': 'failed',
                        'error': error,
                        'completedAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow()
                    }
                }
            )
            logger.error(f"Job {job_id} failed permanently: {error}")
    
    async def notify_completion(self, user_id: str, job_id: str, detection_count: int):
        """Send WebSocket notification via backend."""
        try:
            async with aiohttp.ClientSession() as session:
                await session.post(
                    f"{self.backend_url}/api/notifications/internal",
                    json={
                        'userId': user_id,
                        'type': 'analysis',
                        'title': 'BLAST Analysis Complete',
                        'message': f'Found {detection_count} species matches',
                        'data': {
                            'jobId': job_id,
                            'analysisType': 'blast'
                        }
                    },
                    timeout=aiohttp.ClientTimeout(total=5)
                )
        except Exception as e:
            logger.warning(f"Failed to send notification: {e}")
    
    def stop(self):
        """Stop the worker gracefully."""
        self.running = False
        logger.info("Worker stopping...")


async def main():
    """Main entry point for worker."""
    worker = BlastJobWorker()
    
    try:
        await worker.connect()
        await worker.poll_jobs()
    except KeyboardInterrupt:
        worker.stop()
    finally:
        await worker.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
