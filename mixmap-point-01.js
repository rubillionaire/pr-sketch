// mixmap-08
// lets add some other character. the hard part.
// well its all been learning
// cell shading terrain
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const glsl = require('glslify')
const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const decode = require('@rubenrodriguez/georender-pack/decode')
const { default: prepare } = require('@rubenrodriguez/mixmap-georender/prepare')
const getImagePixels = require('get-image-pixels')

const mix = mixmap(regl, {
  extensions: [
    'oes_element_index_uint',
    'angle_instanced_arrays',
  ],
})

const sampleRate = 64

const prWE = [-67.356661, -65.575714] // horizontal range
const prCenter = 18.220148006000038 // vertical center
// screen height/width = prHeight/prWidth
// screen height/width  * prWidth = prHeight
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
// const prSN = [prCenter - prHeight/2, prCenter + prHeight/2]
const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]
const prCenterPoint = [prHorizontal/2 + -67.356661, prCenter]
const viewbox = [prWE[0],prSN[0],prWE[1],prSN[1]]
console.log({viewbox})

const map = mix.create({
  viewbox,
  backgroundColor: [0.5, 0.5, 0.5, 1.0],  
})

// setup-map:start
let zoomer = null
window.addEventListener('keydown', function (ev) {
  if (zoomer) {
    zoomer.cancel()
    zoomer = null
  }
  if (ev.code === 'Equal') {
    zoomer = animateLinearZoom(map.getZoom(), 1, (curr,end)=>curr>=end)
    zoomer.step()
    // map.setZoom(Math.min(10,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    // map.setZoom(map.getZoom()-1)
    zoomer = animateLinearZoom(map.getZoom(), -1, (curr,end)=>curr<=end)
    zoomer.step()
  }
})
function animateLinearZoom (startZoom, deltaZoom, isFinished) {
  let cancel = false
  const frames = 60
  const zoomIncrement = deltaZoom/frames
  console.log('zoomIncrement:', zoomIncrement)
  const endZoom = startZoom + deltaZoom
  let currentZoom = startZoom
  function step () {
    currentZoom += zoomIncrement
    console.log('currentZoom:', currentZoom)
    map.setZoom(currentZoom)
    if (isFinished(currentZoom, endZoom) || cancel) return
    window.requestAnimationFrame(step)
  }
  return {
    step,
    cancel: () => {
      cancel = true
    },
  }
}

window.addEventListener('resize', () => {
  map.resize(window.innerWidth, window.innerHeight)
})
document.body.style.margin = '0'
document.body.appendChild(mix.render())
document.body.appendChild(map.render({
  width: window.innerWidth,
  height: window.innerHeight,
}))
// setup-map:end

let size = [0,0]
const pointsShader = {
  frag: glsl`
    precision highp float;
    varying vec4 vcolor;
    void main () {
      gl_FragColor = vcolor;
    }
  `,
  pickFrag: `
    precision highp float;
    uniform vec2 size;
    varying float vft, vindex;
    varying vec2 vpos;
    varying vec4 vcolor;
    uniform float featureCount;
    void main () {
      float n = mod((vpos.x*0.5+0.5)*size.x, 2.0);
      vec4 pix1 = vec4(
        floor(vindex/(256.0*256.0)),
        mod(vindex/256.0, 256.0),
        mod(vindex, 256.0),
        255.0) / 255.0;
      float opacity = floor(min(vcolor.w, 1.0));
      //vec4 pix2 = vec4((0.0+opacity)/255.0, 0.0, 0.0, 1.0);
      vec4 pix2 = vec4(10.0/255.0, 0.0, 0.0, 1.0);
      gl_FragColor = mix(pix1, pix2, step(1.0, n));
      /*
      float opacity = floor(min(vcolor.w, 1.0));
      gl_FragColor = vec4(vindex, vft, opacity, 1.0);
      */
    }
  `,
  vert: glsl`
    precision highp float;
    #pragma glslify: Point = require('glsl-georender-style-texture/point.h');
    #pragma glslify: readPoint = require('glsl-georender-style-texture/point.glsl');
    uniform sampler2D styleTexture;
    attribute vec2 position, ioffset;
    attribute float featureType, index;
    uniform vec4 viewbox;
    uniform vec2 offset, size, texSize;
    uniform float featureCount, aspect, zoom;
    varying float vft, vindex, zindex;
    varying vec2 vpos;
    varying vec4 vcolor;
    void main () {
      vft = featureType;
      Point point = readPoint(styleTexture, featureType, zoom, texSize);
      vcolor = point.fillColor;
      vindex = index;
      zindex = point.zindex;
      vec2 p = offset + ioffset;
      float psizex = 5.0 * point.size / size.x * 2.0;
      float psizey = 5.0 * point.size / size.y * 2.0;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
        1.0/(1.0+zindex), 1) + vec4(position.x * psizex, position.y * psizey, 0, 0);
      vpos = gl_Position.xy;
   }
  `,
  uniforms: {
    size: function (context) {
      size[0] = context.viewportWidth
      size[1] = context.viewportHeight
      return size
    },
    styleTexture: map.prop('style'),
    featureCount: map.prop('featureCount'),
    texSize: map.prop('imageSize'),
    aspect: function (context) {
      return context.viewportWidth / context.viewportHeight
    },
  },
  attributes: {
    position: [-0.1,0.1,0.1,0.1,0.1,-0.1,-0.1,-0.1],
    ioffset: {
      buffer: map.prop('positions'),
      divisor: 1
    },
    featureType: {
      buffer: map.prop('types'),
      divisor: 1
    },
    index: {
      buffer: map.prop('indexes'),
      divisor: 1
    }
  },
  elements: [[0,1,2], [2,3,0]],
  primitive: "triangles",
  instances: function (context, props) {
    return props.positions.length/2
  },
  blend: {
    enable: true,
    func: {
      srcRGB: 'src alpha',
      srcAlpha: 1,
      dstRGB: 'one minus src alpha',
      dstAlpha: 1
    }
  }
}

const geojson = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      place: 'city',
    },
    geometry: {
      type: 'Point',
      coordinates: prCenterPoint,
    }
  }]
}

const draw = {
  points: map.createDraw(pointsShader),
}

var style = new Image
style.onload = async () => {
  console.log('load')

  const georender = toGeorender(geojson)
  const decoded = decode(georender)

  const stylePixels = getImagePixels(style)
  const styleTexture = map.regl.texture(style)

  const geodata = prepare({
    stylePixels,
    styleTexture,
    imageSize: [style.width, style.height],
    decoded,
  })

  const props = geodata.update(map.zoom)
  console.log(props)

  draw.points.props.push(props.pointP)
  map.draw()
}
style.src = './style-textures/isolate-place-city.png'

map.on('draw:end', () => {
  console.log('draw-end')
})