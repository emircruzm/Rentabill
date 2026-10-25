import { supabase } from '@data/supabase/client';

export const storageRepository = {
  async uploadFile(bucket: 'store-logos' | 'product-images', path: string, file: Blob | File): Promise<string> {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    });

    if (error) throw error;

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return publicData.publicUrl;
  },
};
