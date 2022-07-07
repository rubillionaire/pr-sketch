// terrain-02
// getPixels(dem) | draw.points
//                    | draw.cells
// attribute a single cell color instead instead of
// interpolating based on elevation.
// single triangles are defined with a common .w
// value that is the max elevation of the vertices.
// perhaps shade based on light position?
const regl = require('regl')()
const resl = require('resl')
const getPixels = require('get-pixels')

getPixels('terrain-rgb/9-161-229.pngraw', onPixels)
const draw = {
  points: drawPoints(),
  cells: drawCells(),
}

async function onPixels (error, pixels) {
  if (error) return console.log(error)
  // positions:start
  const positions = []
  const imgSize = [256, 256]
  const sampleRate = 32
  let maxElevation = 0;
  for (let i = 0; i < sampleRate; i++) {
    for (let j = 0; j < sampleRate; j++) {
      const x = imgSize[0] / sampleRate * i
      const y = imgSize[1] / sampleRate * j
      const r = pixels.get(x, y, 0)
      const g = pixels.get(x, y, 1)
      const b = pixels.get(x, y, 2)
      // height based on mapbox terrain tile
      const z = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
      maxElevation = Math.max(maxElevation, z)
      positions.push([i, j, z])
    }
  }
  // positions:end
  // cells:start
  const cells = []
  const dim =  sampleRate - 1
  // loop through all positions, except the last row
  for (let i = 0; i < sampleRate * sampleRate; i++) {
    const x = i % sampleRate
    const y = Math.floor(i / sampleRate)
    // do not wrap on the edges
    if (x === dim) continue
    if (y === dim) continue
    cells.push([i, i + 1, i + sampleRate])
    cells.push([i + 1, i + sampleRate + 1, i + sampleRate])
  }
  // cells:end
  // npos-ncells:start
  // add a static elevation per cell based on the cells
  // heighest point
  let nPositions = []
  const nCells = []
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    let cellMaxElevation = 0
    for (let j = 0; j < cell.length; j++) {
      const p = positions[cell[j]]
      cellMaxElevation = Math.max(p[2], cellMaxElevation)
    }
    // add next 3 indicies as the next cell
    nCells.push([nPositions.length, nPositions.length + 1, nPositions.length + 2])
    // push the positions with their w/a value as the cell max elevation
    nPositions = nPositions.concat(cell.map(c => positions[c].concat([cellMaxElevation])))
  }
  // npos-ncells:end
  regl.clear({
    color: [0.5,0.5,0.5,1.0],
  })

  // draw.points({
  //   positions,
  //   sampleRate,
  //   maxElevation,
  //   count: positions.length,
  // })
  draw.cells({
    positions: nPositions,
    sampleRate,
    maxElevation,
    cells: nCells,
  })
}

function drawPoints () {
  return regl({
    vert: `
      precision highp float;
      
      attribute vec3 position;
      uniform float sampleRate;
      uniform vec2 viewport;
      varying float elevation;

      void main () {
        vec2 p = (position.xy/sampleRate) * 2.0 - 1.0;
        gl_PointSize = 10.0;
        gl_Position = vec4(p + 40./viewport, 0.0, 1.0);
        elevation = position.z;
      }
    `,
    frag: `
      precision highp float;

      uniform float maxElevation;

      varying float elevation;

      const vec3 blue = vec3(0,0,1);
      const vec3 green = vec3(0,1,0);

      void main () {
        vec3 color = mix(
          blue,
          green,
          elevation/maxElevation
        );
        gl_FragColor = vec4(color, 1 );
      }
    `,
    attributes: {
      position: regl.prop('positions'),  
    },
    uniforms: {
      sampleRate: regl.prop('sampleRate'),
      maxElevation: regl.prop('maxElevation'),
      viewport: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
    },
    primitive: 'points',
    count: regl.prop('count'),
  })
}

function drawCells () {
  return regl({
    vert: `
      precision highp float;
      
      attribute vec4 position;
      uniform float sampleRate;
      uniform vec2 viewport;
      varying float elevation;

      void main () {
        vec2 p = (position.xy/sampleRate) * 2.0 - 1.0;
        gl_PointSize = 10.0;
        gl_Position = vec4(p + 40./viewport, 0.0, 1.0);
        elevation = position.w;
      }
    `,
    frag: `
      precision highp float;

      uniform float maxElevation;

      varying float elevation;

      const vec3 blue = vec3(0,0,1);
      const vec3 green = vec3(0,1,0);

      void main () {
        vec3 color = mix(
          blue,
          green,
          elevation/maxElevation
        );
        gl_FragColor = vec4(color, 1 );
      }
    `,
    attributes: {
      position: regl.prop('positions'),
    },
    uniforms: {
      sampleRate: regl.prop('sampleRate'),
      maxElevation: regl.prop('maxElevation'),
      viewport: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
    },
    elements: regl.prop('cells'),
  })
}
