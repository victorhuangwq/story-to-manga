// Simple test script to verify rate limiting works
const testRateLimit = async () => {
  console.log('Testing rate limiting on localhost:8000...\n');
  
  const testEndpoint = 'http://localhost:8000/api/analyze-story';
  const testData = {
    story: 'Test story for rate limiting',
    style: 'manga'
  };

  let successCount = 0;
  let rateLimitCount = 0;

  // Make 30 requests quickly to test the 25 request limit
  for (let i = 1; i <= 30; i++) {
    try {
      const response = await fetch(testEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData),
      });

      const rateLimitHeaders = {
        limit: response.headers.get('X-RateLimit-Limit'),
        remaining: response.headers.get('X-RateLimit-Remaining'),
        reset: response.headers.get('X-RateLimit-Reset'),
        retryAfter: response.headers.get('Retry-After'),
      };

      if (response.status === 429) {
        rateLimitCount++;
        const data = await response.json();
        console.log(`Request ${i}: RATE LIMITED (${response.status})`);
        console.log(`  Message: ${data.message}`);
        console.log(`  Retry After: ${rateLimitHeaders.retryAfter}s`);
        console.log(`  Headers: Limit=${rateLimitHeaders.limit}, Remaining=${rateLimitHeaders.remaining}`);
      } else if (response.ok) {
        successCount++;
        console.log(`Request ${i}: SUCCESS (${response.status})`);
        console.log(`  Headers: Limit=${rateLimitHeaders.limit}, Remaining=${rateLimitHeaders.remaining}`);
      } else {
        console.log(`Request ${i}: ERROR (${response.status})`);
        const data = await response.json();
        console.log(`  Error: ${data.error}`);
      }
    } catch (error) {
      console.log(`Request ${i}: FETCH ERROR - ${error.message}`);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`\nSummary:`);
  console.log(`  Successful requests: ${successCount}`);
  console.log(`  Rate limited requests: ${rateLimitCount}`);
  console.log(`  Expected: ~25 successful, ~5 rate limited`);
};

// Only run if called directly (not when server is starting)
if (typeof window === 'undefined' && require.main === module) {
  testRateLimit().catch(console.error);
}