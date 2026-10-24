export class Camera {
  public x = 0;
  public y = 0;
  public viewportWidth = 800;
  public viewportHeight = 600;
  public zoom = 2.0; // Crisp 2x pixel scale by default

  public follow(targetX: number, targetY: number, dt: number): void {
    const lerp = Math.min(1, dt * 10);
    this.x += (targetX - this.x) * lerp;
    this.y += (targetY - this.y) * lerp;
  }

  public worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    const sx = (wx - this.x) * this.zoom + this.viewportWidth / 2;
    const sy = (wy - this.y) * this.zoom + this.viewportHeight / 2;
    return { sx, sy };
  }

  public screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    const wx = (sx - this.viewportWidth / 2) / this.zoom + this.x;
    const wy = (sy - this.viewportHeight / 2) / this.zoom + this.y;
    return { wx, wy };
  }
}
