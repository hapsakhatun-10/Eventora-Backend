import { IMGBB_API_KEY } from "../config";

interface ImgbbResponse {
  success: boolean;
  status: number;
  data: {
    id: string;
    url: string;
    display_url: string;
    delete_url: string;
  };
}

export async function uploadToImgbb(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const base64 = buffer.toString("base64");

  const formData = new URLSearchParams();
  formData.append("key", IMGBB_API_KEY);
  formData.append("image", base64);
  formData.append("name", filename);

  const response = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`ImgBB upload failed: ${response.statusText}`);
  }

  const result = (await response.json()) as ImgbbResponse;

  if (!result.success) {
    throw new Error(`ImgBB upload failed with status ${result.status}`);
  }

  return result.data.url;
}
