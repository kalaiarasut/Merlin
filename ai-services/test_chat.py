import httpx
import asyncio

async def test_chat_endpoint():
    # Test the actual /chat endpoint
    async with httpx.AsyncClient(timeout=120.0) as c:
        r = await c.post(
            'http://localhost:8000/chat', 
            json={
                'message': 'What is a yellowfin tuna?'
            }
        )
        print('STATUS:', r.status_code)
        print('RESPONSE:', r.json())

asyncio.run(test_chat_endpoint())
