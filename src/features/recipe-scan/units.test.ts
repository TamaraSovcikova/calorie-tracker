import { describe, expect, it } from 'vitest';
import { gramsFor, writtenLabel } from './units';

const g = (name: string, amount?: number, unit?: string, grams?: number) =>
  gramsFor({ name, amount, unit, grams }).grams;

describe('gramsFor', () => {
  it('fixes the two amounts the model got wrong on the soup', () => {
    // It returned 10 g and 15 g.
    expect(g('tomato puree', 2, 'tbsp', 10)).toBe(30);
    expect(g('soy sauce', 1, 'tsp', 15)).toBe(5);
  });

  it('weights and volumes are exact, whatever the model guessed', () => {
    expect(g('boneless chicken thighs', 1, 'kg', 700)).toBe(1000);
    expect(g('water', 1.5, 'l')).toBe(1500);
    expect(g('soffritto mix', 500, 'g')).toBe(500);
    expect(g('butter', 4, 'oz')).toBe(113);
  });

  it('measures by what is being measured', () => {
    expect(g('dried rosemary', 1, 'tsp')).toBe(1);
    expect(g('chilli flakes', 1, 'tsp')).toBe(2);
    expect(g('salt', 1, 'tsp')).toBe(6);
    expect(g('olive oil', 1, 'tbsp')).toBe(14); // 13.5 rounds up
    expect(g('plain flour', 1, 'cup')).toBe(125);
    expect(g('milk', 1, 'cup')).toBe(240);
  });

  it('tins are drained weight for beans, full weight for tomatoes', () => {
    expect(g('cannellini beans, drained', 2, 'tins')).toBe(480);
    expect(g('chopped tomatoes', 1, 'tin')).toBe(400);
    expect(g('tuna', 1, 'can')).toBe(110);
  });

  it('counts use a per-item weight, with size', () => {
    expect(g('garlic cloves, crushed', 4, 'cloves')).toBe(12);
    expect(g('yellow onion', 2, '')).toBe(300);
    expect(g('large onion', 1, '')).toBe(195);
    expect(g('carrots', 2, 'medium')).toBe(120);
    expect(g('celery sticks', 2, 'sticks')).toBe(80);
    expect(g('chicken stock cubes', 2, 'cubes')).toBe(20);
    expect(g('bay leaves', 2, 'leaves')).toBe(0.4);
    expect(g('white cabbage', 0.5, '')).toBe(450);
    expect(g('eggs', 3)).toBe(150);
  });

  it('a lemon used for juice is the juice, not the fruit', () => {
    expect(g('lemon juice', 1, '')).toBe(45);
    expect(g('lemon', 1, '')).toBe(100);
  });

  it('falls back to the model for a unit or item it cannot place', () => {
    expect(g('dragon fruit', 1, '', 350)).toBe(350);
    expect(g('pesto', 1, 'jar', 190)).toBe(190);
    expect(gramsFor({ name: 'pesto', amount: 1, unit: 'jar', grams: 190 }).basis).toBe('model');
  });

  it('never returns nothing', () => {
    expect(g('salt')).toBe(2);
    expect(g('mystery', 1, 'blob')).toBe(100);
    expect(g('mystery', NaN, 'g', 0)).toBe(2);
  });
});

describe('writtenLabel', () => {
  it('echoes the recipe', () => {
    expect(writtenLabel({ name: 'x', amount: 2, unit: 'tbsp' })).toBe('2 tbsp');
    expect(writtenLabel({ name: 'x', amount: 4 })).toBe('×4');
    expect(writtenLabel({ name: 'x' })).toBeNull();
  });
});
