// peaks-00
// attemps to find peaks in order to replace
// them with graphics of mountains
// perhaps it would be better to just capture
// areas above a certain elevation, and
// replace all those areas with graphics
// of mountains of differenent sizes?
// could produce convex hulls around clusters?
// what stops it from producing one large convex hull
// when there are valleys between ranges?
// perhaps a max distance that a point can be
// in order for it to be considered part of a hull?


const regl = require('regl')({
  extensions: ['oes_texture_float'],
})
const resl = require('resl')

resl({
  manifest: {
    heightMap: {
      type: 'image',
      src: 'terrain-rgb/40-57-7.pngraw',
    },
  },
  onDone,
})

function makePeaksFBO ({ heightMap }) {
  const width = heightMap.width
  const height = heightMap.height

  const fbo = regl.framebuffer({
    colorType: 'float',
    colorFormat: 'rgba',
    height,
    width,
  })

  const findPeaks = regl({
    // framebuffer: fbo,
    vert: `
      precision highp float;

      attribute vec2 position;

      varying vec2 vPosition;

      void main () {
        gl_Position = vec4(position, 0, 1);
        vPosition = position;
      }
    `,
    frag: `
      precision highp float;

      uniform sampler2D heightMap;
      uniform vec2 dimensions;

      varying vec2 vPosition;

      const int interval = 4;
      const float PI = 3.141592653589793;

      float elevationFromHeightMap (vec2 _position) {
        vec3 heightColor = texture2D(heightMap, _position).rgb;
        // float elevation = -10000.0 + (
        //   (heightColor.r * 256.0 * 256.0 + heightColor.g * 256.0 + heightColor.b) * 0.1);
        float elevation = -10000.0 + (
          (heightColor.r * 255.0 * 256.0 * 256.0 + heightColor.g * 255.0 * 256.0 + heightColor.b * 255.0) * 0.1);
        return elevation;
      }

      void main () {
        vec2 dr = 1.0 / dimensions;
        float center_elevation = elevationFromHeightMap(vPosition);
        // float center_elevation = elevationFromHeightMap(gl_FragCoord.xy / dimensions);
        vec2 offset = vec2(1.0) * dr;
        float hyp = distance(vec2(0, 0), offset);
        float twoPI = PI * 2.0;
        float interval_theta = float(interval)/twoPI;
        // start as a peak, if we find a neighbor thats taller,
        // we flip the bit back to 0 for no peak
        float peak = 1.0;
        // theta, p0 = 0,0, p1 = offset
        for (int i = 0; i < interval; i++) {
          float theta = float(i) * interval_theta;
          // hyp = offset.x
          // cos theta = adjacent / hyp
          // sin theta = opposite / hyp
          vec2 offset_point = vec2(cos(theta), sin(theta)) * hyp;
          vec2 offset_position = offset_point + vPosition;
          float offset_elevation = elevationFromHeightMap(offset_position);
          if (offset_elevation > center_elevation) {
            peak = 0.0;
            break;
          }
        }
        if (peak == 1.0 && center_elevation >= 10.0) {
          peak = 0.5;
        }
        gl_FragColor = vec4(vec3(peak), 1.0);
      }
    `,
    attributes: {
      position: [
        [-1, 1],
        [1,1],
        [-1,-1],
        [1, -1],
      ],
    },
    uniforms: {
      heightMap: regl.texture({
        data: heightMap,
        flipY: true,
      }),
      dimensions: [width, height],
    },
    elements: [
      [0, 1, 2],
      [2, 1, 3]
    ],
    count: 6,
  })
  findPeaks()
  return fbo
}


async function onDone ({ heightMap }) {
  regl.clear({
    color: [1,1,1,1],
  })
  const peaksFBO = makePeaksFBO({ heightMap })
  let peaksData = new Float32Array( heightMap.width * heightMap.height * 4 )
  regl.read( {
    framebuffer: peaksFBO,
    data: peaksData,
  } )
  let min = 0
  let max = 0
  let frequencies = {}
  console.log('dimensions:', heightMap.width, heightMap.height)
  console.log('pixels:', heightMap.width * heightMap.height)
  for (let i = 0; i < heightMap.width * heightMap.height; i++) {
    const elevation = peaksData[i * 4] 
    min = Math.min(elevation, min)
    max = Math.max(elevation, max)
    if (!frequencies[elevation]) {
      frequencies[elevation] = 1
    }
    else {
      frequencies[elevation] += 1
    }
  }
  console.log('min:', min)
  console.log('max:', max)
  console.log('frequencies:', frequencies)
}
