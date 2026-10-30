import { Component, computed, input } from '@angular/core';

/** Los 12 colores de los avatares sin imagen: avatar_01 a avatar_12. */
const COLORES = ['#e04848', '#e0873a', '#d9b53b', '#6cc24a', '#2fb388', '#2fa6c4', '#3b7de0', '#6a5ae0', '#a35ae0', '#d95ac0', '#e05a86', '#8a8f98'];

/** Un avatar: la imagen si tiene, y si no, la inicial sobre el color de su clave. */
@Component({
  selector: 'app-avatar',
  template: `
    @if (url()) {
      <img class="avatar-img" [src]="url()" alt="" [style.width.px]="tamano()" [style.height.px]="tamano()" [style.border-radius]="redondo() ? '50%' : '22%'" />
    } @else {
      <span
        class="avatar-letra"
        [style.width.px]="tamano()"
        [style.height.px]="tamano()"
        [style.font-size.px]="tamano() * 0.42"
        [style.border-radius]="redondo() ? '50%' : '22%'"
        [style.background]="color()"
        >{{ inicial() }}</span
      >
    }
  `,
})
export class AvatarVista {
  readonly nombre = input('');
  readonly avatar = input('avatar_01');
  readonly url = input<string | null | undefined>(null);
  readonly tamano = input(48);
  readonly redondo = input(false);

  protected readonly color = computed(() => COLORES[((parseInt(this.avatar().slice(7), 10) || 1) - 1) % COLORES.length]);
  protected readonly inicial = computed(() => (this.nombre()[0] ?? '?').toUpperCase());
}
