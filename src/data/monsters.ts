import { Creature, CreatureSchema } from "../model/model"
import mm from './monsters/mm.json'
import mpmm from './monsters/mpmm.json'
import mm25 from './monsters/mm25.json'
import { z } from "zod"

export type MonsterBook = { monsters: Creature[] }

function parseBook(book: any): Creature[] {
    if (!(book.monsters instanceof Array)) return []
    
    return book.monsters
		.map((monster: unknown) => {
			const parsed = CreatureSchema.safeParse(monster)
			if (parsed.success) return parsed.data
			
			console.warn("error parsing monster:", monster, parsed.error)
			return null
		})
		.filter(function notNull(input: Creature|null): input is Creature {
			return !!input
		})
}

// TODO: find a way to put this in a JSON file, to make TypeScript faster
// But do it in a way where there's still type checking/intellisense on it?
export const Monsters: Creature[] = [
    ...parseBook(mm),
    ...parseBook(mpmm),
    ...parseBook(mm25),
]

export function getMonster(name: string) {
  return Monsters.find((monster) => monster.name === name);
}
