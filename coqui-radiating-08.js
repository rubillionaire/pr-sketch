// coqui-radiating-06
// - 00
// - loads the font, vectorizes it, and renders it
// - 01
// - split word into individual draw calls
// - rotate characters and have them radiate out, fading in and out
// - 02
// - layer on more than one at a time
// - 03
// - add rotation offset so there is a bit more of a dynamic nature.
// this was reed's idea. ty reed.
// - 04
// - theme for use in `radiating-coastline`
// - 05
// - scales text up as it radiates out
// - 06
// - make abundant
// - 07
// - gridded
// - 08
// - gridded but more variability in speed and offsets

const regl = require('regl')()
const glsl = require('glslify')
const vectorizeText = require("vectorize-text")

const colors = {
  light: [255, 243, 135].concat([255.0]),
  dark: [90, 84, 0].concat([255.0]),
}
colors.glslLight = colors.light.map(c => c/255.0)
colors.glslDark = colors.dark.map(c => c/255.0)

const draw = regl({
  attributes: {
    position: regl.prop('positions'),
  },
  elements: regl.prop('cells'),
  uniforms: {
    anchor: regl.prop('anchor'),
    speed: regl.prop('speed'),
    scale: regl.prop('scale'),
    thetaScalar: regl.prop('thetaScalar'),
    maxRadius: regl.prop('maxRadius'),
    aspect: ({ viewportWidth, viewportHeight}) => viewportWidth / viewportHeight,
    charOffset: regl.prop('charOffset'),
    tick: ({ tick }) => tick,
    radiusOffsetNormalized: regl.prop('radiusOffset'),
    thetaOffset: regl.prop('thetaOffset'),
    colorLight: colors.glslLight,
  },
  blend: {
    enable: true,
    func: {
      src: 'src alpha',
      dst: 'one minus src alpha'
    },
  },
  depth: {
    enable: true,
  },
  vert: `
    precision highp float;
    attribute vec2 position;
    uniform float aspect, charOffset, tick, radiusOffsetNormalized, thetaOffset, speed, scale, maxRadius;
    uniform vec2 anchor, thetaScalar;
    varying float vNormalizedRadius;
    
    const float PI = ${Math.PI};

    mat2 rotate2d (float _angle) {
      return mat2(
        cos(_angle), -sin(_angle),
        sin(_angle), cos(_angle)
      );
    }

    void main () {
      vec2 flipY = vec2(1.0, -1.0);
      vec2 scale2d = vec2(scale);
      float radiusOffset = radiusOffsetNormalized * maxRadius;
      float rate = tick * speed;
      float radius = mod(rate + radiusOffset, maxRadius);
      float normalizedRadius = radius/maxRadius;
      scale2d += normalizedRadius * 0.2;
      // char offset is range -1, 1
      // i want to map that onto [0, PI]
      float theta = mix(0.0, PI, 1.0 - smoothstep(thetaScalar.x, thetaScalar.y, charOffset));
      theta += thetaOffset;
      vec2 offset = vec2(cos(theta) * radius, sin(theta) * radius - 0.35);
      mat2 rotation = rotate2d(theta - PI/2.0);
      vec2 p = ((position * flipY) * rotation) * scale2d + vec2(anchor.x, anchor.y * aspect) + offset;
      gl_Position = vec4(p.x, p.y * aspect, 0, 1.0);
      vNormalizedRadius = normalizedRadius;
    }  
  `,
  frag: glsl`
    precision highp float;

    uniform vec4 colorLight;
    varying float vNormalizedRadius;

    #pragma glslify: random = require('glsl-random')

    void main () {
      float radiusRange = step(0.5, vNormalizedRadius);
      vec2 opacityDirection = mix(
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        radiusRange
      );
      vec2 smoothstepRange = mix(
        vec2(0.0, 0.5),
        vec2(0.5, 1.0),
        radiusRange
      );
      float hiddenThreshold = mix(
        opacityDirection.x,
        opacityDirection.y,
        smoothstep(smoothstepRange.x, smoothstepRange.y, vNormalizedRadius)
      );
      float randomThreshold = sqrt(random(gl_FragCoord.xy));
      vec4 color = mix(
        vec4(0.0),
        colorLight,
        step(randomThreshold, hiddenThreshold)
      );

      gl_FragColor = color;
    }
  `,
})

async function main () {
  const font = new FontFace('Fredoka', "url('fonts/Fredoka-SemiBold.ttf')")
  await font.load()
  document.fonts.add(font)
  const mark = 'coquí'

  const markMeshes = ({
      radiusOffset=0.0,
      thetaOffset=0.0,
      anchor=[0, 0],
      speed=0.003,
      scale=0.25,
      thetaScalar=[-1.5, 1.5],
      maxRadius=0.4
    }={}) => {
    return mark.split('').map((char, index, arr) => {
      const markLength = arr.length
      const middleChar = Math.round(markLength/2) - 1
      const singleCharOffset = 1/markLength
      const charOffset = index * singleCharOffset - middleChar *  singleCharOffset
      const mesh = vectorizeText(char, {
        triangles: true,
        textBaseline: "alphabetic",
        font: 'Fredoka',
        size: '10px',
        simplify: false,
        textAlign: 'center',
      })
      return Object.assign({
        charOffset,
        radiusOffset,
        thetaOffset,
        anchor,
        speed,
        scale,
        thetaScalar,
        maxRadius,
      }, mesh)
    })
  }

  const markMeshPair = ({ anchor, speed, scale, thetaScalar, maxRadius }) => {
    const radiusTick = Math.random()
    const radiusTock = (radiusTick + 0.5) % 1.0
    return markMeshes({
      radiusOffset: radiusTick,
      thetaOffset: -Math.PI/20,
      anchor,
      speed,
      scale,
      thetaScalar,
      maxRadius,
    })
    .concat(markMeshes({
      radiusOffset: radiusTock,
      thetaOffset: +Math.PI/20,
      anchor,
      speed,
      scale,
      thetaScalar,
      maxRadius,
    }))
  }
  const tightProps = ({ anchor }) => {
    const [x, y] = anchor
    const xGitter = (Math.random() * 2 - 1) * 0.1
    const yGitter = (Math.random() * 2 - 1) * 0.01
    return {
      speed: 0.0004 * Math.random() + 0.0005,
      scale: 0.0005 * Math.random() + 0.001,
      thetaScalar: [-1.6, 1.6],
      maxRadius: 0.1 * Math.random() + 0.1,
      anchor: [
        x + xGitter,
        y + yGitter,
      ]
    }
  }
  let props = []
  const dim = window.innerWidth/4
  const aspect = window.innerWidth / window.innerHeight
  const rows = Math.round(window.innerWidth / dim)
  const columns = Math.round(window.innerHeight / dim / aspect)
  for (let x = 0; x < rows; x++) {
    for (let y = 0; y < columns; y++) {
      props = props.concat(
        markMeshPair(tightProps({
            anchor: [
              ((x * dim + dim/2) / window.innerWidth) * 2 - 1,
              1.8 - (((y * dim+ dim/2) / window.innerHeight ) * 2 - 1)/aspect,
            ],
          })).flat()
      )
    }
  }
  regl.frame(() => {
    regl.clear({ color: colors.glslDark, depth: true })
    draw(props)
  })

}
main()