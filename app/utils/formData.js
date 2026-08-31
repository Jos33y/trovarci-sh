// Returns the parsed form body, or null when the request is not form-encoded. Scanners POST without a Content-Type.

export async function safeFormData(request) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
