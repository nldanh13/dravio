/** Procedural 3D Emberling Baby Normal: four legs, round flame tail, no wings.
 * Mesh is in xyz (y up, z forward), with interleaved position/normal/linear colour.
 * Visual prototype only, not a production character or a genotype renderer.
 */
type Vec = readonly [number, number, number];
const TAU = Math.PI * 2;
export function wrapYaw(degrees: number): number {
  return Number.isFinite(degrees) ? ((degrees % 360) + 360) % 360 : 0;
}

export function emberlingMesh(): Float32Array {
  const out: number[] = [];
  const orange: Vec = [0.85, 0.35, 0.13];
  const dark: Vec = [0.56, 0.16, 0.09];
  const cream: Vec = [0.99, 0.76, 0.43];
  const gold: Vec = [1, 0.59, 0.13];
  const iris: Vec = [0.35, 0.22, 0.08];
  const black: Vec = [0.075, 0.042, 0.035];
  const white: Vec = [1, 0.96, 0.84];
  function ellipsoid(center: Vec, radii: Vec, color: Vec, tilt = 0, rings = 12, slices = 18) {
    const cs = Math.cos(tilt), sn = Math.sin(tilt);
    const vertex = (lat: number, lon: number) => {
      const x = Math.sin(lat) * Math.cos(lon);
      const y = Math.cos(lat);
      const z = Math.sin(lat) * Math.sin(lon);
      const py = y * radii[1], pz = z * radii[2];
      const ny = y / radii[1], nz = z / radii[2];
      out.push(center[0] + x * radii[0], center[1] + py * cs - pz * sn, center[2] + py * sn + pz * cs,
        x / radii[0], ny * cs - nz * sn, ny * sn + nz * cs, ...color);
    };
    for (let i = 0; i < rings; i++) {
      const a = i * Math.PI / rings, b = (i + 1) * Math.PI / rings;
      for (let j = 0; j < slices; j++) {
        const c = j * TAU / slices, d = (j + 1) * TAU / slices;
        vertex(a, c); vertex(b, c); vertex(a, d);
        vertex(a, d); vertex(b, c); vertex(b, d);
      }
    }
  }
  // Body, chest and big baby head.
  ellipsoid([0, .71, -.12], [.57, .53, .78], orange);
  ellipsoid([0, .76, .48], [.42, .44, .36], cream);
  ellipsoid([0, 1.14, .48], [.40, .45, .40], orange);
  ellipsoid([0, 1.49, .67], [.60, .55, .55], orange, -.10, 18, 24);
  ellipsoid([0, 1.23, 1.12], [.42, .27, .32], cream);
  ellipsoid([0, 1.39, 1.27], [.29, .15, .19], orange);
  for (const side of [-1, 1]) {
    // Two front and two rear feet: no wings or horns on Baby.
    ellipsoid([side * .38, .36, .41], [.23, .34, .23], orange);
    ellipsoid([side * .43, .17, .58], [.25, .16, .32], orange);
    ellipsoid([side * .45, .46, -.48], [.31, .35, .37], orange);
    ellipsoid([side * .48, .16, -.36], [.28, .15, .32], orange);
    for (let i = -1; i <= 1; i++) {
      ellipsoid([side * .43 + i * .10, .12, .83], [.052, .07, .074], cream, 0, 6, 9);
      ellipsoid([side * .48 + i * .11, .11, -.10], [.052, .07, .074], cream, 0, 6, 9);
    }
    // Big eyes visible from front and profile.
    ellipsoid([side * .39, 1.59, 1.02], [.205, .25, .155], dark);
    ellipsoid([side * .405, 1.60, 1.095], [.166, .205, .115], iris);
    ellipsoid([side * .412, 1.61, 1.176], [.113, .166, .060], black);
    ellipsoid([side * .412 - .045, 1.69, 1.222], [.045, .050, .025], white, 0, 8, 10);
    ellipsoid([side * .135, 1.43, 1.43], [.042, .030, .018], dark, 0, 6, 10);
    ellipsoid([side * .49, 1.39, .48], [.13, .19, .19], orange, 0, 8, 12);
  }
  // Round flame tail, curving up behind the dragon. Segments overlap smoothly.
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, r = .25 - .15 * t;
    ellipsoid([.18 * Math.sin(t * Math.PI), .56 + .65 * t * t, -.65 - .95 * t],
      [r, r, r + .09], orange, -.45 * t, 8, 12);
  }
  ellipsoid([0, 1.20, -1.68], [.22, .32, .23], gold, -.30);
  ellipsoid([0, 1.40, -1.72], [.14, .21, .15], cream, -.30);
  // Rounded dorsal scales; not additional locomotion anatomy.
  for (let i = 0; i < 4; i++) {
    ellipsoid([0, 1.17 - i * .04, -.15 - i * .16], [.12, .14, .12], dark, 0, 8, 12);
  }
  return new Float32Array(out);
}
