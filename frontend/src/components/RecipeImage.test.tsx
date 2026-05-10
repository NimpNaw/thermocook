import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecipeImage } from './RecipeImage';

describe('RecipeImage', () => {
  it('construit src avec size=thumb', () => {
    render(
      <RecipeImage
        folder="ma-recette_r42"
        filename="images/principale.jpg"
        size="thumb"
        alt="Tarte aux pommes"
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'src',
      '/api/thumbs/ma-recette_r42/images/principale.jpg?size=thumb'
    );
  });

  it('construit src avec size=medium', () => {
    render(
      <RecipeImage
        folder="ma-recette_r42"
        filename="images/principale.jpg"
        size="medium"
        alt="Tarte aux pommes"
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'src',
      '/api/thumbs/ma-recette_r42/images/principale.jpg?size=medium'
    );
  });

  it('a loading=lazy sur img', () => {
    render(
      <RecipeImage
        folder="ma-recette_r42"
        filename="images/principale.jpg"
        size="thumb"
        alt="Tarte aux pommes"
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
  });

  it('applique dominantColor comme backgroundColor sur le conteneur', () => {
    const { container } = render(
      <RecipeImage
        folder="ma-recette_r42"
        filename="images/principale.jpg"
        size="thumb"
        alt="Tarte aux pommes"
        dominantColor="#f4a261"
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.backgroundColor).toBe('rgb(244, 162, 97)');
  });

  it('utilise #f3f4f6 comme fond par défaut quand dominantColor absent', () => {
    const { container } = render(
      <RecipeImage
        folder="ma-recette_r42"
        filename="images/principale.jpg"
        size="thumb"
        alt="Tarte aux pommes"
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.backgroundColor).toBe('rgb(243, 244, 246)');
  });
});
