const https = require('http');

const options = {
  hostname: '10.0.113.145',
  port: 3001,
  path: '/api/pull-requests?limit=100',
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const prs = JSON.parse(data);
    let fresh = 0, stale = 0, none = 0, noData = 0;
    const staleExamples = [];
    
    prs.forEach(pr => {
      if (!pr.available_packages) {
        noData++;
      } else if (pr.available_packages.status === 'FRESH') {
        fresh++;
      } else if (pr.available_packages.status === 'STALE') {
        stale++;
        if (staleExamples.length < 10) {
          staleExamples.push({
            number: pr.number,
            lastPackage: pr.available_packages.lastPackageDate,
            lastCommit: pr.available_packages.lastCommitDate,
            packages: pr.available_packages.packages
          });
        }
      } else if (pr.available_packages.status === 'NONE') {
        none++;
      }
    });
    
    console.log('Sample of', prs.length, 'PRs:');
    console.log('FRESH:', fresh);
    console.log('STALE:', stale);
    console.log('NONE:', none);
    console.log('No package data:', noData);
    
    console.log('\nStale examples:');
    staleExamples.forEach(ex => {
      console.log(`PR #${ex.number}: packages=${ex.packages?.join(',') || 'none'}`);
      console.log(`  Last package: ${ex.lastPackage}`);
      console.log(`  Last commit:  ${ex.lastCommit}`);
    });
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();
