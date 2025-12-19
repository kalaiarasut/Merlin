import httpx
import asyncio

async def test():
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(
            'http://localhost:11434/api/chat', 
            json={
                'model': 'llama3.2:1b', 
                'messages': [{'role': 'user', 'content': 'What is a yellowfin tuna? Answer in 2 sentences.'}], 
                'stream': False
            }
        )
        print('STATUS:', r.status_code)
        print('RESPONSE:', r.json())

asyncio.run(test())
