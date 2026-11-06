import { Float32BufferAttribute, LatheGeometry, TorusGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Match the authored cup's coordinates so its liquid, logo and hand contacts stay put. */
export function createCeramicCupGeometry() {
  const profile = [
    [0, .02], [.285, .02], [.30, .03], [.305, .055],
    [.365, .535], [.37, .555], [.366, .568], [.357, .57],
    [.345, .568], [.335, .555], [.332, .535], [.269, .108],
    [.265, .09], [0, .09],
  ].map(([radius, height]) => new Vector2(radius, height));
  const body = new LatheGeometry(profile, 48);
  // The upper attachment stays below the rim and liquid surface.
  const handle = new TorusGeometry(.17, .05, 10, 32);
  handle.translate(.41, .285, 0);
  const geometry = mergeGeometries([body, handle])!;
  body.dispose(); handle.dispose();
  // Some authored materials also serve vertex-coloured static batches.
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
  geometry.computeBoundingBox();
  return geometry;
}
