import React, { useState } from 'react';

interface RecipeImageProps {
  folder: string;
  filename: string;
  size: 'thumb' | 'medium';
  dominantColor?: string;
  alt: string;
  className?: string;
}

export const RecipeImage: React.FC<RecipeImageProps> = ({
  folder,
  filename,
  size,
  dominantColor,
  alt,
  className = '',
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const src = `/api/thumbs/${folder}/${filename}?size=${size}`;
  const bg = dominantColor ?? '#f3f4f6';

  return (
    <div
      className={`overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ backgroundColor: bg }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-cover transition-opacity duration-200"
        style={{ opacity: loaded && !error ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
};
