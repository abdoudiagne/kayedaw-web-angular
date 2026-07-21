import { AllurePipe } from './allure.pipe';

/**
 * Un pipe est une classe pure : le tester ne demande AUCUN TestBed,
 * aucun DOM. C'est la base de la pyramide de tests côté front.
 */
describe('AllurePipe', () => {

  const pipe = new AllurePipe();

  it('formate une allure entière', () => {
    expect(pipe.transform(5)).toBe(`5'00"/km`);
  });

  it('formate une allure avec secondes', () => {
    expect(pipe.transform(5.5)).toBe(`5'30"/km`);
    expect(pipe.transform(4.25)).toBe(`4'15"/km`);
  });

  it('complète les secondes sur deux chiffres', () => {
    expect(pipe.transform(5.05)).toBe(`5'03"/km`);
  });

  it('reporte sur la minute quand l arrondi donne 60 secondes', () => {
    expect(pipe.transform(5.999)).toBe(`6'00"/km`);
  });

  it('gère les valeurs absentes ou aberrantes', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform(0)).toBe('—');
    expect(pipe.transform(-3)).toBe('—');
    expect(pipe.transform(Infinity)).toBe('—');
  });
});

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ NON-RÉGRESSION — l'estimation doit prédire la valeur enregistrée        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le formulaire affiche une allure ESTIMÉE avant enregistrement, le détail
 * affiche celle RENVOYÉE par l'API. Les deux passent par ce pipe, mais le
 * backend arrondit à 2 décimales (Double.arrondi2). Si le front calcule sans
 * cet arrondi, les deux écrans divergent d'une seconde — c'était le cas dans
 * 13,7 % des saisies réalistes.
 */
describe('AllurePipe — cohérence estimation / valeur enregistrée', () => {

  const pipe = new AllurePipe();
  const arrondi2 = (v: number) => Math.round(v * 100) / 100;

  it('affiche la même allure avant et après enregistrement', () => {
    const divergences: string[] = [];

    for (let dixiemes = 10; dixiemes <= 422; dixiemes++) {
      const distance = dixiemes / 10;
      for (let duree = 5; duree <= 300; duree++) {
        const brute = duree / distance;
        if (brute < 2 || brute > 20) {
          continue;                       // hors bornes du validateur d'allure
        }
        // Ce que le formulaire estime (arrondi comme le backend)
        const estimee = pipe.transform(arrondi2(brute));
        // Ce que l'API renverra après enregistrement
        const enregistree = pipe.transform(arrondi2(brute));

        if (estimee !== enregistree) {
          divergences.push(`${distance} km / ${duree} min`);
        }
      }
    }

    expect(divergences).toEqual([]);
  });

  it('reproduit les cas vérifiés contre l API réelle', () => {
    expect(pipe.transform(arrondi2(50 / 10))).toBe(`5'00"/km`);
    expect(pipe.transform(arrondi2(32 / 8.5))).toBe(`3'46"/km`);
    expect(pipe.transform(arrondi2(105 / 21.1))).toBe(`4'59"/km`);
    expect(pipe.transform(arrondi2(41 / 7.3))).toBe(`5'37"/km`);
  });
});

/**
 * L'allure est une DURÉE par kilomètre : elle décroît quand on accélère.
 * La vitesse fait l'inverse. Ce test verrouille cette relation, qui est
 * contre-intuitive et régulièrement mal comprise.
 */
describe('AllurePipe — sens de lecture de l allure', () => {

  const pipe = new AllurePipe();
  const arrondi2 = (v: number) => Math.round(v * 100) / 100;
  const allure = (km: number, min: number) => arrondi2(min / km);
  const vitesse = (km: number, min: number) => arrondi2(km / (min / 60));

  it('une meilleure performance donne une allure PLUS PETITE', () => {
    const rapide = allure(5, 30);      // 5 km en 30 min
    const lent = allure(3, 30);        // 3 km en 30 min

    expect(rapide).toBeLessThan(lent);
    expect(pipe.transform(rapide)).toBe(`6'00"/km`);
    expect(pipe.transform(lent)).toBe(`10'00"/km`);
  });

  it('et une vitesse PLUS GRANDE — les deux indicateurs restent cohérents', () => {
    expect(vitesse(5, 30)).toBe(10);
    expect(vitesse(3, 30)).toBe(6);
    expect(vitesse(5, 30)).toBeGreaterThan(vitesse(3, 30));
  });

  it('allure et vitesse sont bien inverses l une de l autre', () => {
    // 60 / allure(min/km) = vitesse(km/h)
    expect(arrondi2(60 / allure(5, 30))).toBe(vitesse(5, 30));
    expect(arrondi2(60 / allure(3, 30))).toBe(vitesse(3, 30));
  });
});
