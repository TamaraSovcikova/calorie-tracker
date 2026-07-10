/**
 * The pet species a user can choose. Each maps to a full pose set under
 * src/assets/pet/{species}-{pose}.webp. 'dog' is the original default.
 */

export type PetSpecies = 'dog' | 'cat' | 'shepherd' | 'parrot';

export const PET_SPECIES: PetSpecies[] = ['dog', 'cat', 'shepherd', 'parrot'];

export const PET_SPECIES_LABEL: Record<PetSpecies, string> = {
  dog: 'Puppy',
  cat: 'Cat',
  shepherd: 'Shepherd',
  parrot: 'Parrot',
};

/** Coerce a stored pet.breed value into a known species (defaults to dog). */
export function normalizeSpecies(breed: string | null | undefined): PetSpecies {
  return breed && (PET_SPECIES as string[]).includes(breed)
    ? (breed as PetSpecies)
    : 'dog';
}
