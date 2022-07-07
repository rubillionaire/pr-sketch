// terrain-01
// getPixels(dem) | draw.points
//                    | draw.cells
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
console.log('positions')
console.log(positions)
console.log('cells')
console.log(cells)
  regl.clear({
    color: [0.5,0.5,0.5,1.0],
  })

  draw.points({
    positions,
    sampleRate,
    maxElevation,
    count: positions.length,
  })
  draw.cells({
    positions,
    sampleRate,
    maxElevation,
    cells,
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
    elements: regl.prop('cells'),
  })
}
