// Check staleness logic for PR 12032

const commentDate = new Date('2026-01-07T09:11:52Z'); // Last package build
const headCommitDate = new Date('2026-01-07T09:14:16Z'); // Latest commit

console.log('Package build comment:', commentDate.toISOString());
console.log('HEAD commit date:', headCommitDate.toISOString());
console.log('Is comment < head?', commentDate < headCommitDate);
console.log('Should be STALE?', commentDate < headCommitDate ? 'YES' : 'NO');
console.log('');
console.log('Time difference:', (headCommitDate - commentDate) / 1000, 'seconds');
