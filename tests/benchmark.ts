import { runAllBenchmarks } from '../src/utils/benchmark';

console.log('\n========================================');
console.log('  BetterNoteBooks Performance Benchmark  ');
console.log('========================================\n');

const results = runAllBenchmarks();

console.table(
	results.map((r) => ({
		Benchmark: r.name,
		'Duration (ms)': `${r.durationMs} ms`,
		'Throughput (ops/s)': r.opsPerSec.toLocaleString(),
	})),
);

console.log('Benchmark completed successfully.\n');
