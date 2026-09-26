export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include', ...options,
    headers: {'Content-Type': 'application/json', ...options.headers},
    ...(options.body !== undefined ? {body: JSON.stringify(options.body)} : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    throw error;
  }
  return result;
}
