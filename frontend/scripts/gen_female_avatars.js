const fs = require("fs");
const dir = "public/images/specialists";
const skin = ["#f1c7a5", "#e0a878", "#c68642", "#8d5524"];
const hairFemale = ["#5b3a29", "#2b2b2b", "#6b4f2a", "#7a4b2b", "#3a2a4d"];
const cloth = ["#00535b", "#0d9488", "#8c4e35", "#01544f", "#7c3aed", "#b45309", "#be185d", "#0e7490"];

function svg(seed, isFemale) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
  h = Math.abs(h);
  const sk = skin[h % skin.length];
  const hr = hairFemale[(h >> 2) % hairFemale.length];
  const cl = cloth[(h >> 4) % cloth.length];
  const hairStyle = isFemale
    ? `<path d="M30 34 Q30 6 70 6 Q110 6 110 34 Q110 20 70 18 Q30 20 30 34 Z" fill="${hr}"/>` +
      `<path d="M30 34 Q24 70 34 96 L44 92 Q40 64 44 40 Z" fill="${hr}"/>` +
      `<path d="M110 34 Q116 70 106 96 L96 92 Q100 64 96 40 Z" fill="${hr}"/>`
    : `<path d="M30 32 Q30 8 70 8 Q110 8 110 32 Q110 22 70 20 Q30 22 30 32 Z" fill="${hr}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 160" width="280" height="320">
  <rect width="140" height="160" fill="#eef2f4"/>
  <circle cx="70" cy="160" r="60" fill="${cl}"/>
  <ellipse cx="70" cy="72" rx="34" ry="38" fill="${sk}"/>
  ${hairStyle}
  <circle cx="58" cy="70" r="4" fill="#1f2937"/>
  <circle cx="82" cy="70" r="4" fill="#1f2937"/>
  <path d="M60 86 Q70 94 80 86" stroke="#9c4a3c" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;
}

const female = { plumber: 2, electrician: 2, hvac: 2, painter: 1, carpenter: 1, techsupport: 1, cleaning: 1, general: 2 };
let count = 0;
for (const [cat, n] of Object.entries(female)) {
  for (let i = 1; i <= n; i++) {
    const name = `${cat}_female_${i}`;
    fs.writeFileSync(`${dir}/${name}.svg`, svg(name, true));
    count++;
  }
}
console.log("generated", count, "female svg avatars");
