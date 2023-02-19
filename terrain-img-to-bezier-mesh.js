const angleNormals = require('angle-normals')
const PerlinNoise = require('perlin-noise-3d')
const perlinNoise = new PerlinNoise()
const earcut = require('earcut')

module.exports = terrainImgToMesh;

// bezier helpers
// a = start, b = control, c = end, t = [0..1]
function cubicBezierDimension (a, b, c, t) {
  return (
    (a * (1 - t) + b * t) * (1 - t) +
    (b * (1 - t) + c * t) * t
  )
}

function cubicBezier3d (a, b, c, t) {
  return [
    cubicBezierDimension(a[0], b[0], c[0], t),
    cubicBezierDimension(a[1], b[1], c[1], t),
    cubicBezierDimension(a[2], b[2], c[2], t)
  ]
}

function lerp (start, end, percent) {
  if (percent > 1.0) percent = 1.0
  if (percent < 0.0) percent = 0.0
  return (1.0 - percent) * start + (percent * end)
}

function controlPoint (start, end, controlPercent) {
  return [
    lerp(start[0], end[0], controlPercent[0]),
    lerp(start[1], end[1], controlPercent[1]),
    lerp(start[2], end[2], controlPercent[2])
  ]
}

/**
 * given an ndarray of pixels, return the mesh that represents
 * the terrain, with unique cell positions that each have a single
 * elevation attributed to them
 * 
 * @param  {float} options.sampleRate   frequency to sample the pixels
 * @param  {ndarray} options.pixels     ndarray of pixels that represent an image
 * @param  {array} options.bbox          [west,south,east,north] extends of the image
 * @param  {number} options.bezierSteps  number of intermediate bezier points
 * @param  {array} options.bezierControlPercent  [[0..1], [0..1], [0..1]] 3d relative percent between start a, end c to place the control point b
 * @return {object} mesh
 * @return {float} mesh.maxElevation    the max z value for the posistions
 * @return {array} mesh.positions        [vec4(float)] representing positions in space. w/a/[3] element is the average z value for the positions that make up the cell
 * @return {array} mesh.cells             [vec3(int)]
 * @return {array} mesh.normals         [vec3(float)] cell normals
 */
function terrainImgToMesh ({
  sampleRate,
  pixels,
  bbox = [0,0,1,1],
  bezierSteps=5,
  bezierControlPercent=[0.5, 0.5, 0.5],
}) {
  const xExtent = bbox[2] - bbox[0]
  const yExtent = bbox[3] - bbox[1]
  const minX = bbox[0]
  const minY = bbox[1]
  const maxY = bbox[3]

  const { positions, maxElevation } = (({ pixels, sampleRate }) => {
    const positions = []
    const imgSize = pixels.shape
    let maxElevation = 0;
    for (let i = 0; i <= sampleRate; i++) {
      for (let j = 0; j <= sampleRate; j++) {
        let x = Math.floor((imgSize[0]-1) / sampleRate * i)
        let y = Math.floor((imgSize[1]-1) / sampleRate * j)
        const r = pixels.get(x, y, 0)
        const g = pixels.get(x, y, 1)
        const b = pixels.get(x, y, 2)
        // height based on mapbox terrain tile
        const z = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
        maxElevation = Math.max(maxElevation, z)
        // west to east
        const lon = minX + (xExtent * (i / sampleRate))
        // north to south
        const lat = maxY - (yExtent * (j / sampleRate))
        positions.push([lon, lat, z])
      }
    }
    return {
      positions,
      maxElevation,
    }
  })({ pixels, sampleRate })

  // cells:start
  const cells = (({ sampleRate }) => {
    const cells = []
    // const dim =  sampleRate - 1
    // loop through all positions, except the last row
    for (let i = 0; i < positions.length; i++) {
      const x = Math.floor(i % (sampleRate + 1))
      const y = Math.floor(i / (sampleRate + 1))
      // do not wrap on the edges
      if (x === sampleRate) continue
      if (y === sampleRate) continue
      cells.push([i, i + 1, i + sampleRate + 1])
      cells.push([i + 1, i + sampleRate + 2, i + sampleRate + 1])
    }
    return cells
  })({ sampleRate })

  // n-prefix for the new positions and cells that are created so that
  // each set of positions also includes a w/a value that corresponds
  // to the elevation of the triangle. then push this unique set of
  // positions into nPositions, and add their indicies to nCells
  const { nPositions, nCells } = (({ positions, cells }) => {
    let nPositions = []
    const nCells = []
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      let cellMaxElevation = 0
      for (let j = 0; j < cell.length; j++) {
        const z = positions[cell[j]][2]
        cellMaxElevation = Math.max(z, cellMaxElevation)
        // cellMaxElevation += z
      }
      // cellMaxElevation/=3
      // add next 3 indicies as the next cell
      nCells.push([nPositions.length, nPositions.length + 1, nPositions.length + 2])
      // push the positions with their w/a value as the cell max elevation
      nPositions = nPositions.concat(
        cell.map(c => {
          // if the maxElevation is 0, then assign perlin noise elevation to
          // each of the positon valies
          if (cellMaxElevation === 0) {
            const p = positions[c]
            return [p[0], p[1], perlinNoise.get(p[0], p[1], p[2])].concat([cellMaxElevation])
          }
          return positions[c].concat([cellMaxElevation])
        })
      )
    }
    return {
      nPositions,
      nCells,
    }  
  })({ positions, cells })

  // take each cell, do bezeir interpolation at the bezeirStep to pruduce
  // another set of positions and cells
  const { bPositions, bCells } = (({ nPositions, nCells }) => {
    const bPositions = []
    const bCells = []
    // each cell represents 3 points, p1, p2, p3
    // for pairs p1-p2 and p1-p3, interpolate bezier points
    // take all points and pass them through earcut to get triangles
    // loop through triangles and push indicies of their position
    // into the cells array
    for (let i = 0; i < nCells.length; i++) {
      const cell = nCells[i]
      // vec4
      const p1 = nPositions[cell[0]]
      const p2 = nPositions[cell[1]]
      const p3 = nPositions[cell[2]]
      if (!p1 || !p2 || !p3) continue
      if (p1[3] === 0) {
        // water using perlin noise, we can pass through
        bPositions.push(p1)
        bPositions.push(p2)
        bPositions.push(p3)
        bCells.push([
          bPositions.length - 3,
          bPositions.length - 2,
          bPositions.length - 1
        ])
        continue
      }
      // vec3
      // TODO: try doing p1p2 p2p3 p3p1 to see how that looks too
      const p1p2Control = controlPoint(p1, p2, bezierControlPercent)
      const p1p3Control = controlPoint(p1, p3, bezierControlPercent)
      // cacl bezier points
      const p1p2BezeirPoints = []
      const p1p3BezeirPoints = []
      for (let j = 0; j < bezierSteps; j++) {
        const t = j/bezierSteps
        const p1p2i = cubicBezier3d(p1, p1p2Control, p2, t)
        const p1p3i = cubicBezier3d(p2, p1p3Control, p3, t)
        p1p2BezeirPoints.push(p1p2i)
        p1p3BezeirPoints.push(p1p3i)
      }
      const bezierPoints = p1p2BezeirPoints.concat(p1p3BezeirPoints.reverse())
      const bezierPointsFlat = bezierPoints
        .reduce((acc, curr) => {
          return acc.concat(curr)
        }, [])
      const triangles = earcut(bezierPointsFlat, null, 3)
      for (let j = 0; j < triangles.length; j+=3) {
        const triangleIndex1 = triangles[j + 0]
        const triangleIndex2 = triangles[j + 1]
        const triangleIndex3 = triangles[j + 2]
        bPositions.push(bezierPoints[triangleIndex1].concat([p1[3]]))
        bPositions.push(bezierPoints[triangleIndex2].concat([p1[3]]))
        bPositions.push(bezierPoints[triangleIndex3].concat([p1[3]]))
        bCells.push([
          bPositions.length - 3,
          bPositions.length - 2,
          bPositions.length - 1
        ])
      }
    }
    return { bPositions, bCells }
  })({ nPositions, nCells })

  const normals = angleNormals(bCells, bPositions)

  return {
    maxElevation,
    positions: bPositions,
    cells: bCells,
    normals,
  }
}