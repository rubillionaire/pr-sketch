// coqui-radiating-02
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
    width: regl.prop('width'),
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
  vert: `
    precision highp float;
    attribute vec2 position;
    uniform float width, aspect, charOffset, tick, radiusOffsetNormalized, thetaOffset;
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
      vec2 scale = vec2(0.25);
      float maxRadius = 0.4;
      float radiusOffset = radiusOffsetNormalized * maxRadius;
      float speed = tick * 0.003;
      float radius = mod(speed + radiusOffset, maxRadius);
      float normalizedRadius = radius/maxRadius;
      scale += normalizedRadius * 0.2;
      // char offset is range -1, 1
      // i want to map that onto [0, PI]
      float theta = mix(0.0, PI, 1.0 - (charOffset * 0.5 + 0.5));
      theta += thetaOffset;
      vec2 offset = vec2(cos(theta) * radius, sin(theta) * radius - 0.35);
      mat2 rotation = rotate2d(theta - PI/2.0);
      vec2 p = ((position * flipY) * rotation) * scale + offset;
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
  const width = 1
  const mark = 'coquí'

  const markMeshes = ({ radiusOffset=0.0, thetaOffset=0.0 }={}) => {
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
        width,
        charOffset,
        radiusOffset,
        thetaOffset,
      }, mesh)
    })
  }

  const props = markMeshes({
      radiusOffset: 0.0,
      thetaOffset: -Math.PI/20,
    })
    .concat(markMeshes({
      radiusOffset: 0.5,
      thetaOffset: +Math.PI/20,
    }))
  regl.frame(() => {
    regl.clear({ color: colors.glslDark })
    draw(props)
  })

}
main()