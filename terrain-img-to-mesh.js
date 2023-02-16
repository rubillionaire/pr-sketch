const angleNormals = require('angle-normals')
const PerlinNoise = require('perlin-noise-3d')
const perlinNoise = new PerlinNoise()

module.exports = terrainImgToMesh;

/**
 * given an ndarray of pixels, return the mesh that represents
 * the terrain, with unique cell positions that each have a single
 * elevation attributed to them
 * 
 * @param  {float} options.sampleRate   frequency to sample the pixels
 * @param  {ndarray} options.pixels     ndarray of pixels that represent an image
 * @param  {array} options.bbox          [west,south,east,north] extends of the image
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
  
  const normals = angleNormals(nCells, nPositions)

  return {
    maxElevation,
    positions: nPositions,
    cells: nCells,
    normals,
  }
}