# How to Get Semantic Scholar API Key (Free)

**Get 1000 requests / 5 min instead of 100/5min - completely free!**

## Steps:

1. Go to: https://www.semanticscholar.org/product/api
2. Click **"Get API Key"**
3. Sign up with email (no credit card required)
4. Copy your API key

## Configure in CMLRE:

### Option A: Environment Variable (Recommended)
```bash
# Add to .env file in ai-services directory
SEMANTIC_SCHOLAR_API_KEY=your_key_here
```

### Option B: System Environment
```powershell
# Windows PowerShell
$env:SEMANTIC_SCHOLAR_API_KEY="your_key_here"

# Restart ai-services after setting
```

## Verify It's Working

After adding the key, restart AI services and check the logs:
```
Using Semantic Scholar API key for higher rate limits
```

## Rate Limits

| Auth | Rate Limit |
|------|------------|
| No key | 100 requests / 5 min |
| With key | **1000 requests / 5 min** |

That's 10x more capacity! 🚀
