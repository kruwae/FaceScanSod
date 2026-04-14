import { apiGet } from '../core/api.js';

export async function loadKnownFaces() {
  return apiGet('getKnownFaces');
}

export function toFaceDescriptors(records = []) {
  return records.map((u) => ({
    name: u.employeeId || u.label || '',
    descriptor: new Float32Array(u.descriptor)
  }));
}

export function findBestMatch(faceapi, queryDescriptor, knownFaces = []) {
  let best = { name: 'unknown', distance: 1.0 };

  knownFaces.forEach((u) => {
    const distance = faceapi.euclideanDistance(queryDescriptor, u.descriptor);
    if (distance < best.distance) best = { name: u.name, distance };
  });

  return best;
}
