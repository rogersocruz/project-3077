/** Nome de tropa para a interface: "Linha nv. 2". */
import type { TFunction } from 'i18next';

export function troops(t: TFunction, type: string, level: number): string {
  return `${t(`troops.${type}`)} · ${t('intel.level', { level })}`;
}
