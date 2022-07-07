// terrain-00
// getPixels(dem) | drawPoints

const regl = require('regl')()
const resl = require('resl')
const getPixels = require('get-pixels')

const draw = drawPoints()
getPixels('terrain-rgb/9-161-229.pngraw', onPixels)

async function onPixels (error, pixels) {
  if (error) return console.log(error)
  const positions = []
  const imgSize = [256, 256]
  // pixels is 256x256
  // 256/8 = 32
  // 256/16 = 16
  const sampleRate = 32
  let maxElevation = 0;
  for (var i = 0; i < sampleRate; i++) {
    for (var j = 0; j < sampleRate; j++) {
      const x = imgSize[0] / sampleRate * i
      const y = imgSize[1] / sampleRate * j
      const r = pixels.get(x, y, 0);
      const g = pixels.get(x, y, 1);
      const b = pixels.get(x, y, 2);
      if (r === undefined || g === undefined || b === undefined ) continue
      // height based on mapbox terrain tile
      const z = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
      maxElevation = Math.max(maxElevation, z)
      // positions.push([x, y, z])
      positions.push([i, j, z])
    }
  }

  regl.clear({
    color: [0.5,0.5,0.5,1.0],
  })

  draw({
    positions,
    sampleRate,
    maxElevation,
    count: positions.length,
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
