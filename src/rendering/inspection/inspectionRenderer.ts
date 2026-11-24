import { emberlingMesh } from './emberlingMesh';

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform vec2 uYaw;
uniform vec2 uFit;
varying vec3 vColor;
varying vec3 vNormal;
vec3 rotate(vec3 p) {
  vec3 r = vec3(uYaw.x*p.x+uYaw.y*p.z, p.y, -uYaw.y*p.x+uYaw.x*p.z);
  return vec3(r.x, .927*r.y-.375*r.z, .375*r.y+.927*r.z);
}
void main(){
  vec3 p = rotate(aPos-vec3(0.,1.,0.));
  gl_Position=vec4(p.x*uFit.x,p.y*uFit.y,-p.z/5.,1.);
  vNormal=rotate(aNormal);
  vColor=aColor;
}`;
const FRAGMENT = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormal;
void main(){
  vec3 n=normalize(vNormal);
  vec3 l=normalize(vec3(-.55,.80,.85));
  float diffuse=max(0.,dot(n,l));
  float gloss=pow(max(0.,dot(n,normalize(l+vec3(0.,0.,1.)))),24.);
  float rim=pow(1.-max(0.,n.z),3.);
  vec3 c=vColor*(.52+.62*diffuse)+vec3(1.,.84,.48)*(.18*gloss+.07*rim);
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

function shader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s=gl.createShader(type);
  if(!s) throw new Error('shader allocation');
  gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(error ?? 'shader compile');
  }
  return s;
}

export interface InspectionRenderer { draw(yawDegrees: number): void; dispose(): void }

/** Fixed orthographic camera, true mesh depth testing. Redraw only on input or resize. */
export function createInspectionRenderer(canvas: HTMLCanvasElement): InspectionRenderer {
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});
  if(!gl) throw new Error('WebGL unavailable');
  const program=gl.createProgram();
  const buffer=gl.createBuffer();
  if(!program || !buffer){
    if(program) gl.deleteProgram(program);
    if(buffer) gl.deleteBuffer(buffer);
    throw new Error('WebGL allocation');
  }
  let vs: WebGLShader | null=null, fs: WebGLShader | null=null;
  try {
    vs=shader(gl,gl.VERTEX_SHADER,VERTEX);
    fs=shader(gl,gl.FRAGMENT_SHADER,FRAGMENT);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  } catch(e) {
    gl.deleteProgram(program);gl.deleteBuffer(buffer);throw e;
  } finally {
    if(vs) gl.deleteShader(vs);
    if(fs) gl.deleteShader(fs);
  }
  const mesh=emberlingMesh();
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.STATIC_DRAW);
  for(const [i,name] of ['aPos','aNormal','aColor'].entries()){
    const loc=gl.getAttribLocation(program,name);
    gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12);
  }
  const yaw=gl.getUniformLocation(program,'uYaw'), fit=gl.getUniformLocation(program,'uFit');
  gl.enable(gl.DEPTH_TEST);
  let disposed=false;
  return {
    draw(degrees){
      if(disposed || gl.isContextLost()) return;
      const dpr=Math.min(2,window.devicePixelRatio || 1);
      const w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
      if(canvas.width!==w) canvas.width=w;
      if(canvas.height!==h) canvas.height=h;
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const a=degrees*Math.PI/180, k=Math.min(w,h)/4.3;
      gl.uniform2f(yaw,Math.cos(a),Math.sin(a));gl.uniform2f(fit,2*k/w,2*k/h);
      gl.drawArrays(gl.TRIANGLES,0,mesh.length/9);
    },
    dispose(){if(disposed)return;disposed=true;gl.deleteBuffer(buffer);gl.deleteProgram(program);}
  };
}
