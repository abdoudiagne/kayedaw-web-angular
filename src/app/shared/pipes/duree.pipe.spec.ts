import { DureePipe } from './duree.pipe';

describe('DureePipe', () => {

  const pipe = new DureePipe();

  it('affiche les durées de moins d une heure en minutes', () => {
    expect(pipe.transform(45)).toBe('45 min');
  });

  it('affiche les heures et minutes', () => {
    expect(pipe.transform(95)).toBe('1h35');
    expect(pipe.transform(120)).toBe('2h00');
  });

  it('gère les valeurs absentes', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(-5)).toBe('—');
  });
});
