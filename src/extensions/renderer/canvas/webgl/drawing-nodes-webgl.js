// For rendering nodes
import * as util from './webgl-util';
import { defaults } from '../../../../util';
import { mat3 } from 'gl-matrix';

const initDefaults = defaults({
  getKey: null,
  drawElement: null,
  getBoundingBox: null,
  getRotation: null,
  getRotationPoint: null,
  getRotationOffset: null,
  texSize: 1024,
});


export class NodeDrawing {
  constructor(r, gl, options) {
    this.r = r;
    this.gl = gl;

    // equal to the numer of texture units used by the fragment shader
    this.maxInstances = 10; 

    this.program = this.createShaderProgram();
    this.vao = this.createVAO();

    this.styleKeyToTexture = new Map();
    this.renderTypes = new Map(); // string -> object
  }

  addRenderType(type, options) {
    this.renderTypes.set(type, initDefaults(options));
  }

  createShaderProgram() {
    const { gl } = this;

    const vertexShaderSource = `#version 300 es
      precision highp float;

      uniform mat3 uPanZoomMatrix;

      in mat3 aNodeMatrix;

      in vec2 aVertexPosition;
      in vec2 aTexCoord;

      out vec2 vTexCoord;
      flat out int vTexId;

      void main(void) {
        vTexCoord = aTexCoord;
        vTexId = gl_InstanceID;
        gl_Position = vec4(uPanZoomMatrix * aNodeMatrix * vec3(aVertexPosition, 1.0), 1.0);
      }
    `;


    const fragmentShaderSource = `#version 300 es
      precision highp float;

      uniform sampler2D uTexture0;
      uniform sampler2D uTexture1;
      uniform sampler2D uTexture2;
      uniform sampler2D uTexture3;
      uniform sampler2D uTexture4;
      uniform sampler2D uTexture5;
      uniform sampler2D uTexture6;
      uniform sampler2D uTexture7;
      uniform sampler2D uTexture8;
      uniform sampler2D uTexture9;

      in vec2 vTexCoord;
      flat in int vTexId;

      out vec4 outColor;

      void main(void) {
        if     (vTexId == 0) outColor = texture(uTexture0, vTexCoord);
        else if(vTexId == 1) outColor = texture(uTexture1, vTexCoord);
        else if(vTexId == 2) outColor = texture(uTexture2, vTexCoord);
        else if(vTexId == 3) outColor = texture(uTexture3, vTexCoord);
        else if(vTexId == 4) outColor = texture(uTexture4, vTexCoord);
        else if(vTexId == 5) outColor = texture(uTexture5, vTexCoord);
        else if(vTexId == 6) outColor = texture(uTexture6, vTexCoord);
        else if(vTexId == 7) outColor = texture(uTexture7, vTexCoord);
        else if(vTexId == 8) outColor = texture(uTexture8, vTexCoord);
        else if(vTexId == 9) outColor = texture(uTexture9, vTexCoord);
      }
    `;

    const program = util.createProgram(gl, vertexShaderSource, fragmentShaderSource);

    program.uPanZoomMatrix = gl.getUniformLocation(program, 'uPanZoomMatrix');
    program.aNodeMatrix = gl.getUniformLocation(program, 'aNodeMatrix');
    program.aVertexPosition = gl.getAttribLocation(program, 'aVertexPosition');
    program.aTexCoord = gl.getAttribLocation(program, 'aTexCoord');

    program.uTextures = [];
    for(let i = 0; i < this.maxInstances; i++) {
      program.uTextures.push(gl.getUniformLocation(program, 'uTexture' + i));
    }

    return program;
  }

  createVAO() {
    const unitQuad = [
      0, 0,  0, 1,  1, 0,
      1, 0,  0, 1,  1, 1,
    ];
    const texQuad = [
      0, 0,  0, 1,  1, 0,
      1, 0,  0, 1,  1, 1,
    ];
  
    const { gl, program } = this;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    { // node quad
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(unitQuad), gl.STATIC_DRAW);
      gl.vertexAttribPointer(program.aVertexPosition, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(program.aVertexPosition);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    { // texture coords
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texQuad), gl.STATIC_DRAW);
      gl.vertexAttribPointer(program.aTexCoord, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(program.aTexCoord);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    { // matrix data
      const matrixSize = 9; // 3x3 matrix
      this.matrixData = new Float32Array(this.maxInstances * matrixSize);

      // use matrix views to set values directly into the matrixData array
      this.matrixViews = new Array(this.maxInstances);
      for(let i = 0; i < this.maxInstances; i++) {
        const byteOffset = i * matrixSize * 4; // 4 bytes per float
        this.matrixViews[i] = new Float32Array(this.matrixData.buffer, byteOffset, matrixSize); // array view
      }

      this.matrixBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.matrixData.byteLength, gl.DYNAMIC_DRAW);

      // each row of the matrix needs to be a separate attribute
      for(let i = 0; i < 3; i++) {
        const loc = program.aNodeMatrix + i;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 3 * 12, i * 12);
        gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    gl.bindVertexArray(null);
    return vao;
  }

  createTexture(node, opts) {
    const { r, gl  } = this;
    const { texSize } = opts;

    function drawTextureCanvas() {
      // This stretches the drawing to fill a square texture, not sure if best approach.
      const bb = opts.getBoundingBox(node);
      const scalew = texSize / bb.w
      const scaleh = texSize / bb.h;
  
      const textureCanvas = util.createTextureCanvas(r, texSize);
  
      const { context } = textureCanvas;
      context.save();
      context.scale(scalew, scaleh);
      opts.drawElement(context, node, bb, true, false);
      context.restore();
  
      return textureCanvas;
    }

    function bufferTexture(textureCanvas) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize, texSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return texture;
    }

    const styleKey = opts.getKey(node);
    let texture = this.styleKeyToTexture.get(styleKey);
    if(!texture) {
      const canvas = drawTextureCanvas();
      texture = bufferTexture(canvas);
      this.styleKeyToTexture.set(styleKey, texture);
    }
    texture.styleKey = styleKey; // for debug
    return texture;
  }


  setTransformMatrix(node, opts, matrix) {
    // matrix is expected to be a 9 element array
    // follows same pattern as CRp.drawCachedElementPortion(...)
    const bb = opts.getBoundingBox(node);
    let x, y;

    mat3.identity(matrix);

    const theta = opts.getRotation(node);
    if(theta !== 0) {
      const { x:sx, y:sy } = opts.getRotationPoint(node);
      mat3.translate(matrix, matrix, [sx, sy]);
      mat3.rotate(matrix, matrix, theta);

      const offset = opts.getRotationOffset(node);
      x = offset.x;
      y = offset.y;
    } else {
      x = bb.x1;
      y = bb.y1;
    }
    
    mat3.translate(matrix, matrix, [x, y]);
    mat3.scale(matrix, matrix, [bb.w, bb.h]);
  }


  startBatch(panZoomMatrix) {
    if(panZoomMatrix) {
      this.panZoomMatrix = panZoomMatrix;
    }
    this.instances = 0;
    this.textures = [];
  }

  draw(type, node) {
    const opts = this.renderTypes.get(type);

    // TODO pass the array view to createTransformMatrix, no need to create a new instance every draw call
    const matrixView = this.matrixViews[this.instances];
    this.setTransformMatrix(node, opts, matrixView);

    const texture = this.createTexture(node, opts);
    this.textures.push(texture);
    this.instances++;

    if(this.instances >= this.maxInstances) {
      // end the current batch and start a new one
      this.endBatch();
      this.startBatch();
    }
  }

  endBatch() {
    if(this.instances === 0) 
      return;

    console.log('drawing nodes ' + this.instances);
    const { gl, program, vao } = this;

    gl.useProgram(program);
    gl.bindVertexArray(vao);

    // upload the new matrix data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.matrixBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.matrixData);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Activate all the texture units that we need
    for(let i = 0; i < this.instances; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
      gl.uniform1i(program.uTextures[i], i);
    }

    // Set the matrix uniform
    gl.uniformMatrix3fv(program.uPanZoomMatrix, false, this.panZoomMatrix);

    // draw!
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instances); // 6 verticies per node

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

}
