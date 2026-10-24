export class InputManager {
  private keys: Set<string> = new Set();
  public joystickVector: { x: number; y: number } = { x: 0, y: 0 };
  public actionPressed = false;
  public interactPressed = false;
  public placeOrUsePressed = false;
  public hotbarKeyPressed: number | null = null;
  private keyDownHandler: (e: KeyboardEvent) => void;
  private keyUpHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.keyDownHandler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
      if (e.code === 'Space') this.actionPressed = true;
      if (e.code === 'KeyE' || e.code === 'KeyF') this.interactPressed = true;
      if (e.code === 'KeyR' || e.code === 'KeyQ') this.placeOrUsePressed = true;

      if (e.code.startsWith('Digit')) {
        const num = Number(e.code.replace('Digit', ''));
        if (num >= 1 && num <= 8) {
          this.hotbarKeyPressed = num - 1;
        }
      }
    };

    this.keyUpHandler = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.actionPressed = false;
      if (e.code === 'KeyE' || e.code === 'KeyF') this.interactPressed = false;
      if (e.code === 'KeyR' || e.code === 'KeyQ') this.placeOrUsePressed = false;
    };
  }

  public attach(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  public detach(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
  }

  public setJoystick(x: number, y: number): void {
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      this.joystickVector.x = x / mag;
      this.joystickVector.y = y / mag;
    } else {
      this.joystickVector.x = x;
      this.joystickVector.y = y;
    }
  }

  public getMoveVector(): { x: number; y: number } {
    if (Math.hypot(this.joystickVector.x, this.joystickVector.y) > 0.08) {
      return { ...this.joystickVector };
    }

    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;

    const mag = Math.hypot(kx, ky);
    if (mag > 0) {
      return { x: kx / mag, y: ky / mag };
    }
    return { x: 0, y: 0 };
  }
}
