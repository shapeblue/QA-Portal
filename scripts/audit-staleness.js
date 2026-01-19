const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'qadb',
  user: 'qauser',
  password: 'P@ssword123'
});

async function auditStaleness() {
  try {
    const result = await pool.query(`
      SELECT 
        number,
        available_packages
      FROM pull_requests
      WHERE available_packages IS NOT NULL
      ORDER BY number DESC
    `);

    console.log('Total PRs with package data:', result.rows.length);
    
    let fresh = 0;
    let stale = 0;
    let none = 0;
    
    const staleExamples = [];
    
    result.rows.forEach(row => {
      const pkg = row.available_packages;
      if (pkg.status === 'FRESH') fresh++;
      else if (pkg.status === 'STALE') {
        stale++;
        if (staleExamples.length < 10) {
          staleExamples.push({
            number: row.number,
            lastPackage: pkg.lastPackageDate,
            lastCommit: pkg.lastCommitDate,
            packages: pkg.packages
          });
        }
      }
      else if (pkg.status === 'NONE') none++;
    });
    
    console.log('\nStatus breakdown:');
    console.log('- FRESH:', fresh);
    console.log('- STALE:', stale);
    console.log('- NONE:', none);
    
    console.log('\nStale examples:');
    staleExamples.forEach(ex => {
      console.log(`  PR #${ex.number}:`);
      console.log(`    Last package: ${ex.lastPackage}`);
      console.log(`    Last commit:  ${ex.lastCommit}`);
      console.log(`    Packages: ${ex.packages?.join(', ') || 'none'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

auditStaleness();
