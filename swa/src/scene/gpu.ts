// Nombre del renderizador WebGL: la GPU, o "Basic Render Driver" / "SwiftShader" si el navegador pinta por software.
export function rendererName(gl: WebGLRenderingContext): string {
  const d = gl.getExtension('WEBGL_debug_renderer_info')
  return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
}
