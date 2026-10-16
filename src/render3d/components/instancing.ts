import { useLayoutEffect, useRef } from 'react';
import { Color, type InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';

export interface InstanceXform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly sz?: number;
  readonly color?: string;
}

/**
 * Grava os dados das instâncias depois de todo commit em que o mesh OU os dados
 * mudaram. O React Three Fiber recria o InstancedMesh quando algum item de `args`
 * muda de identidade; sem reaplicar, todas as instâncias voltariam à matriz
 * identidade e se empilhariam na origem.
 */
export function useInstanceWriter<T>(data: T, write: (mesh: InstancedMesh, data: T) => void) {
  const ref = useRef<InstancedMesh>(null);
  const applied = useRef<{ mesh: InstancedMesh | null; data: T | undefined }>({
    mesh: null,
    data: undefined,
  });
  // Sem lista de dependências de propósito: a checagem abaixo é barata e pega a recriação.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    if (applied.current.mesh === mesh && applied.current.data === data) return;
    write(mesh, data);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    applied.current = { mesh, data };
  });
  return ref;
}

const m = new Matrix4();
const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const pos = new Vector3();
const scl = new Vector3();
const col = new Color();

function writeXforms(mesh: InstancedMesh, list: readonly InstanceXform[]): void {
  list.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rotY ?? 0);
    pos.set(t.x, t.y, t.z);
    scl.set(t.sx ?? 1, t.sy ?? t.sx ?? 1, t.sz ?? t.sx ?? 1);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    if (t.color) mesh.setColorAt(i, col.set(t.color));
  });
  mesh.count = list.length;
}

/** Posição/rotação/escala (e cor) de cada instância a partir de uma lista. */
export function useInstanceMatrices(list: readonly InstanceXform[]) {
  return useInstanceWriter(list, writeXforms);
}

/** Lote de instâncias com matriz pronta (peças compostas, bandejas). */
export interface MatrixBatchItem {
  readonly matrix: Matrix4;
  readonly color?: string;
}

function writeMatrices(mesh: InstancedMesh, items: readonly MatrixBatchItem[]): void {
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.matrix);
    if (it.color) mesh.setColorAt(i, col.set(it.color));
  });
  mesh.count = items.length;
}

export function useInstanceBatch(items: readonly MatrixBatchItem[]) {
  return useInstanceWriter(items, writeMatrices);
}
