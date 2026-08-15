import { computeProfile } from '../src/lib/style/calibration.ts'
import { styleDistance } from '../src/lib/style/vector.ts'
import { readFileSync } from 'node:fs'
import type { CorpusName } from '../src/lib/types.ts'

const corpus = JSON.parse(readFileSync('data/corpus/names.json','utf8')).names as CorpusName[]
const cal = corpus.filter(n => n.is_calibration_name)

// Theoretisches Maximum: A sagt Ja zu allem nahe 0, B zu allem nahe 1 (pro Achse)
const axes = ['era','softness','reach','frequency','ambiguity'] as const
const low  = { era:0, softness:0, reach:0, frequency:0, ambiguity:0 }
const high = { era:1, softness:1, reach:1, frequency:1, ambiguity:1 }
console.log('absolute Obergrenze der normierten Distanz:', styleDistance(low as any, high as any).toFixed(3))

// Realistisch: beide bewerten das Kalibrierungsset maximal gegensätzlich
function profileFor(pick: (n: CorpusName)=>boolean) {
  return computeProfile(cal.map(n => ({ vector: n.style_vector, value: pick(n) ? 'like' as const : 'pass' as const })))
}
for (const axis of axes) {
  const sorted = [...cal].sort((a,b)=>a.style_vector[axis]-b.style_vector[axis])
  const lowNames = new Set(sorted.slice(0,5).map(n=>n.name))
  const highNames = new Set(sorted.slice(-5).map(n=>n.name))
  const pa = profileFor(n=>lowNames.has(n.name))
  const pb = profileFor(n=>highNames.has(n.name))
  console.log(`nur ${axis}-Gegensatz:`.padEnd(28), styleDistance(pa.vector, pb.vector).toFixed(3))
}

// Extremfall: A mag nur die 3 "weichsten+modernsten", B nur die 3 gegenteiligen
const score = (n: CorpusName) => n.style_vector.softness + n.style_vector.era + n.style_vector.reach + n.style_vector.frequency
const byScore = [...cal].sort((a,b)=>score(a)-score(b))
const pa = profileFor(n => byScore.slice(0,4).some(x=>x.name===n.name))
const pb = profileFor(n => byScore.slice(-4).some(x=>x.name===n.name))
console.log('maximal gegensätzlich:'.padEnd(28), styleDistance(pa.vector, pb.vector).toFixed(3))
console.log('  A:', JSON.stringify(Object.fromEntries(axes.map(a=>[a, pa.vector[a].toFixed(2)]))))
console.log('  B:', JSON.stringify(Object.fromEntries(axes.map(a=>[a, pb.vector[a].toFixed(2)]))))

// Wieviele zufällige Paarungen überschreiten welchen Schwellwert?
let rnd = 1
const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648
const dists: number[] = []
for (let i=0;i<3000;i++) {
  const pick = () => { const s = new Set<string>(); for (const n of cal) if (rand()<0.4) s.add(n.name); return s }
  const A = pick(), B = pick()
  if (!A.size || !B.size) continue
  dists.push(styleDistance(profileFor(n=>A.has(n.name)).vector, profileFor(n=>B.has(n.name)).vector))
}
dists.sort((a,b)=>a-b)
const q = (p:number) => dists[Math.floor(p*dists.length)].toFixed(3)
console.log(`\n${dists.length} zufällige Paare — Median ${q(0.5)}, p75 ${q(0.75)}, p90 ${q(0.9)}, p95 ${q(0.95)}, p99 ${q(0.99)}, max ${dists.at(-1)!.toFixed(3)}`)
for (const t of [0.25,0.3,0.35,0.4,0.5]) console.log(`  Anteil > ${t}: ${(dists.filter(d=>d>t).length/dists.length*100).toFixed(1)} %`)
