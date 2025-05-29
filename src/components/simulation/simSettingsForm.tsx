import React, { FC, ReactNode, useMemo, useState } from 'react'
import { AtkAction, Encounter, EncounterTweak, SimulationResult, SimulationSettings } from '../../model/model'
import styles from './simSettingsForm.module.scss'
import Range from '../utils/range'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCog, faQuestionCircle } from '@fortawesome/free-solid-svg-icons'
import { evaluateDiceFormula } from '../../model/dice'
import { exists } from '../../model/utils'

type PropType = {
    value: SimulationSettings,
    encounters: Encounter[],
    simulationResults: SimulationResult,
    onChange: (newValue: SimulationSettings) => void,
}

type EncounterSuggestion = {
    encounterIndex: number,
    shorter?: {
        hpTweaks: { creatureId: string, newValue: number }
    },
    longer?: {
        hpTweaks: { creatureId: string, newValue: number },
        newCreatures: { minCR: number, maxCR: number },
    },
    easier?: {
        damageTweaks: { creatureId: string, actionId: string, newValue: number },
    },
    harder?: {
        damageTweaks: { creatureId: string, actionId: string, newValue: number },
    },
}

function generateSuggestions(encounters: Encounter[], simulationResults: SimulationResult) {
    const suggestions: EncounterSuggestion[] = []
    
    if (!simulationResults.length) return suggestions;

    for (let i = 0 ; i < encounters.length ; i++) {
        const encounter = encounters[i]
        const result = simulationResults[i]
        const suggestion: EncounterSuggestion = { encounterIndex: i }

        // Can't make suggestions if the encounter is empty
        if (encounter.monsters.length === 0) continue;

        // Can't make suggestions if the encounter hasn't run yet
        if (!result) continue;
        if (result.rounds.length <= 1) continue;
        
        // If the encounters were just swapped, we're getting the wrong simulation result and we can't make suggestions
        if (!result.rounds[0].team2.find(combattant => combattant.creature.id === encounter.monsters[0].id)) continue;



        // Find the actual HP of each creature, which might already have been modified by using a suggestion
        // That way we can find the creature responsible for the most EHP in the encounter
        const monsterHP = encounter.monsters.map(monster => {
            const { id } = monster
            const combattant = result.rounds[0].team2.find(combattant => combattant.creature.id === monster.id)
            if (!combattant) return null

            const hp = combattant.creature.hp
            const totalHP = hp * monster.count
            return { id, hp, totalHP }
        }).filter(exists)
        const creatureWithMostHP = monsterHP.reduce<null|typeof monsterHP[number]>((c1, c2) => ((c1 !== null) && (c1.totalHP > c2.totalHP)) ? c1 : c2, null)
        
        if (creatureWithMostHP) {
            // Find ways to make the encounter shorter (only possible if the encounter has at least 2 full rounds - round 0 is just the initial state)
            if (result.rounds.length > 2) {
                const rounds = result.rounds.length
                const newHP = Math.floor(creatureWithMostHP.hp * (rounds - 1) / rounds)
    
                suggestion.shorter = {
                    hpTweaks: { creatureId: creatureWithMostHP.id, newValue: newHP },
                }
            }
    
            // Find ways to make the encounter longer (only possible if the players are winning the encounter)
            const playersWin = !!result.rounds[result.rounds.length - 1].team1.find(combattant => (combattant.finalState.currentHP > 0))
            if (playersWin) {
                // 1. Calculate the players' DPR, to find a CR range which would add one round worth of EHP to the battle
                const playerDPR = encounter.monsters.map(monster => monster.hp * monster.count).reduce((a,b) => (a+b), 0) / (result.rounds.length - 1)
                const minCR = CRstatTable.find(({ hp }) => hp > playerDPR)?.CR || 0
                const maxCR = CRstatTable.findLast(({ hp }) => hp > playerDPR)?.CR || 30

                // 2. Offer to increase the HP of the creature with the most HP
                const rounds = result.rounds.length
                const newHP = Math.floor(creatureWithMostHP.hp * (rounds + 1) / rounds)

                suggestion.longer = {
                    hpTweaks: { creatureId: creatureWithMostHP.id, newValue: newHP },
                    newCreatures: { minCR, maxCR },
                }
            }
        }
    
        // Find ways to make the encounter easier or harder
        const enemyDamage = encounter.monsters.map(monster => {
            const combattants = result.rounds[0].team2.filter(combattant => combattant.creature.id === monster.id)
            const damagePerAction = new Map<string, number>()
            let damage = 0
            for (let combattant of combattants) {
                const stats = result.stats.get(combattant.id)
                if (!!stats) {
                    damage += stats.damageDealt
                    for (let [actionId, damage] of stats.damagePerAction) {
                        damagePerAction.set(actionId, (damagePerAction.get(actionId) || 0) + damage)
                    }
                }
            }

            return { monster, combattants, damage, damagePerAction }
        })
        const creatureWithMostDamage = enemyDamage.reduce<null|typeof enemyDamage[number]>((a, b) => ((a !== null) && (a.damage > b.damage)) ? a : b, null)
        if (creatureWithMostDamage) {
            const attacks: AtkAction[] = creatureWithMostDamage.combattants[0].creature.actions.filter((action): action is AtkAction => (action.type === "atk"))
            if (!!attacks.length) {
                const highestDamageAtkId = creatureWithMostDamage.damagePerAction.entries().reduce<null|[string, number]>((a, b) => ((a !== null) && (a[1] > b[1])) ? a : b, null)?.[0]
                if (!!highestDamageAtkId) {
                    const attackToChange = attacks.find(atk => atk.id === highestDamageAtkId)
                    if (!!attackToChange) {
                        const averageDamage = evaluateDiceFormula(attackToChange.dpr, 0.5)
                        const increasedDamage = Math.round(averageDamage * 11) / 10
                        const decreasedDamage = Math.round(averageDamage * 9) / 10
                    
                        suggestion.harder = {
                            damageTweaks: { creatureId: creatureWithMostDamage.monster.id, actionId: highestDamageAtkId, newValue: increasedDamage }
                        }
                        suggestion.easier = {
                            damageTweaks: { creatureId: creatureWithMostDamage.monster.id, actionId: highestDamageAtkId, newValue: decreasedDamage }
                        }
                    }
                }
            }
        }


        suggestions.push(suggestion)
    }

    return suggestions
}

const CRstatTable = [
    { CR: 0,   hp: 3.5,   dmg: 0.5   },
    { CR: 1/8, hp: 21,    dmg: 2.5   },
    { CR: 1/4, hp: 42.5,  dmg: 4.5   },
    { CR: 1/2, hp: 60,    dmg: 7     },
    { CR: 1,   hp: 78,    dmg: 11.5  },
    { CR: 2,   hp: 93,    dmg: 17.5  },
    { CR: 3,   hp: 108,   dmg: 23.5  },
    { CR: 4,   hp: 123,   dmg: 29.5  },
    { CR: 5,   hp: 138,   dmg: 35.5  },
    { CR: 6,   hp: 153,   dmg: 41.5  },
    { CR: 7,   hp: 168,   dmg: 47.5  },
    { CR: 8,   hp: 183,   dmg: 53.5  },
    { CR: 9,   hp: 198,   dmg: 59.5  },
    { CR: 10,  hp: 213,   dmg: 65.5  },
    { CR: 11,  hp: 228,   dmg: 71.5  },
    { CR: 12,  hp: 243,   dmg: 77.5  },
    { CR: 13,  hp: 258,   dmg: 83.5  },
    { CR: 14,  hp: 273,   dmg: 89.5  },
    { CR: 15,  hp: 288,   dmg: 95.5  },
    { CR: 16,  hp: 303,   dmg: 101.5 },
    { CR: 17,  hp: 318,   dmg: 107.5 },
    { CR: 18,  hp: 333,   dmg: 113.5 },
    { CR: 19,  hp: 348,   dmg: 119.5 },
    { CR: 20,  hp: 378,   dmg: 131.5 },
    { CR: 21,  hp: 423,   dmg: 149.5 },
    { CR: 22,  hp: 468,   dmg: 167.5 },
    { CR: 23,  hp: 513,   dmg: 185.5 },
    { CR: 24,  hp: 558,   dmg: 203.5 },
    { CR: 25,  hp: 603,   dmg: 221.5 },
    { CR: 26,  hp: 648,   dmg: 239.5 },
    { CR: 27,  hp: 693,   dmg: 257.5 },
    { CR: 28,  hp: 738,   dmg: 275.5 },
    { CR: 29,  hp: 782.5, dmg: 293.5 },
    { CR: 30,  hp: 827.5, dmg: 311.5 }
]

const SimSettingsForm: FC<PropType> = ({ value, encounters, simulationResults, onChange }) => {
    const encounterSuggestions = useMemo(() => generateSuggestions(encounters, simulationResults), [encounters, simulationResults])
    
    function update(callback: (clone: SimulationSettings) => void) {
        const clone = structuredClone(value)
        callback(clone)
        onChange(clone)
    }

    function updateEncounter(encounterIndex: number, callback: (clone: EncounterTweak) => void) {
        const clone = structuredClone(value)
        const tweak: EncounterTweak = clone.encounterTweaks.get(encounterIndex) || { hpTweaks: new Map(), damageTweaks: new Map() }
        if (!clone.encounterTweaks.has(encounterIndex)) clone.encounterTweaks.set(encounterIndex, tweak)
        callback(tweak)
        onChange(clone)
    }

    return <>
        <div className={styles.form}>
            <button className={styles.toggleBtn}>
                <FontAwesomeIcon icon={faCog} />
            </button>

            <div className={styles.panel}>
                <h2>Simulation Settings</h2>

                { /* Luck Slider */ }
                <FormFieldWithHelp tooltip={<>
                    <p>
                        Changing this setting allows you to quickly visualize how <b>swingy</b> your encounter is, 
                        by simulating what happens if your players are slightly luckier or slightly more unlucky than average.
                    </p>
                    <p>
                        A luck factor of +1 means instead of rolling 10 on average, the players will roll 11 on average, and their enemies will roll 9 on average.
                    </p>
                </>}>
                    <div className={styles.luckSlider}>
                        <label>Luck:</label>

                        <Range
                            value={value.luck * 100}
                            onChange={v => update(clone => { clone.luck = v/100 })}
                            min={35}
                            max={65}
                            step={5}
                            label={
                                (value.luck === 0.5) ? "even"
                            : (value.luck > 0.5)   ? `+${Math.round(value.luck * 20 - 10)}`
                                                    : String(Math.round(value.luck * 20 - 10))
                            } />
                    </div>
                </FormFieldWithHelp>

                { /* Player Tactics */ }
                <FormFieldWithHelp tooltip={(
                    <ul>
                        <li><b>Default:</b> makes no change</li>
                        <li><b>Focus Fire:</b> will change the PC's attacks to always target the enemy with the lowest HP. </li>
                        <li><b>Spread Attacks:</b> will change the PC's attacks to always target the enemy with the most HP (recommended for groups of in-experienced players!)</li>
                    </ul>
                )}>
                    <div className={styles.luckSlider}>
                        <label>Player Tactics:</label>

                        <div className={styles.tacticsBtns}>
                            <button
                                disabled={value.team1Strategy === "CUSTOM"}
                                onClick={() => update(v => { v.team1Strategy = "CUSTOM" }) }>
                                    Default
                            </button>
                            <button
                                disabled={value.team1Strategy === "FOCUS_FIRE"}
                                onClick={() => update(v => { v.team1Strategy = "FOCUS_FIRE" }) }>
                                    Focus Fire
                            </button>
                            <button
                                disabled={value.team1Strategy === "SPREAD_OUT"}
                                onClick={() => update(v => { v.team1Strategy = "SPREAD_OUT" }) }>
                                    Spread Attacks
                            </button>
                        </div>
                    </div>
                </FormFieldWithHelp>

                { /* Enemy Tactics */ }
                <FormFieldWithHelp tooltip={(
                    <ul>
                        <li><b>Default:</b> makes no change</li>
                        <li><b>Focus Fire:</b> will change the enemies's attacks to always target the PC with the lowest HP (warning: can be deadly!)</li>
                        <li><b>Spread Attacks:</b> will change the enemies's attacks to always target the PC with the most HP.</li>
                    </ul>
                )}>
                    <div className={styles.luckSlider}>
                        <label>Enemy Tactics:</label>

                        <div className={styles.tacticsBtns}>
                            <button
                                disabled={value.team2Strategy === "CUSTOM"}
                                onClick={() => update(v => { v.team2Strategy = "CUSTOM" }) }>
                                    Default
                            </button>
                            <button
                                disabled={value.team2Strategy === "FOCUS_FIRE"}
                                onClick={() => update(v => { v.team2Strategy = "FOCUS_FIRE" }) }>
                                    Focus Fire
                            </button>
                            <button
                                disabled={value.team2Strategy === "SPREAD_OUT"}
                                onClick={() => update(v => { v.team2Strategy = "SPREAD_OUT" }) }>
                                    Spread Attacks
                            </button>
                        </div>
                    </div>
                </FormFieldWithHelp>

                { encounterSuggestions.length && <>
                    <h3>Encounter Tweaking Suggestions</h3>
    
                    {encounterSuggestions.map(suggestion => (
                        <div key={suggestion.encounterIndex} className={styles.encounterCard}>
                            <h4>
                                Make Encounter {suggestion.encounterIndex + 1}:

                                <button onClick={() => update(v => v.encounterTweaks.delete(suggestion.encounterIndex))}>
                                    Reset Changes
                                </button>
                            </h4>

                            <div className={styles.suggestions}>
                                { !!suggestion.shorter && (
                                    <button onClick={() => updateEncounter(suggestion.encounterIndex, v => {
                                        v.hpTweaks.set(suggestion.shorter!.hpTweaks.creatureId, suggestion.shorter!.hpTweaks.newValue)
                                    })}>
                                        Shorter
                                    </button>
                                )}
                                { !!suggestion.longer && (
                                    <button onClick={() => updateEncounter(suggestion.encounterIndex, v => {
                                        v.hpTweaks.set(suggestion.longer!.hpTweaks.creatureId, suggestion.longer!.hpTweaks.newValue)
                                    })}>
                                        Longer
                                    </button>
                                )}
                                { (!!suggestion.harder && !!suggestion.easier) && <>
                                    <button onClick={() => updateEncounter(suggestion.encounterIndex, v => {
                                        if (!v.damageTweaks.has(suggestion.easier!.damageTweaks.creatureId)) v.damageTweaks.set(suggestion.easier!.damageTweaks.creatureId, new Map())
                                        const dmgTweak = v.damageTweaks.get(suggestion.easier!.damageTweaks.creatureId)!
                                        dmgTweak.set(suggestion.easier!.damageTweaks.actionId, suggestion.easier!.damageTweaks.newValue)
                                    })}>
                                        Easier
                                    </button>
                                    <button onClick={() => updateEncounter(suggestion.encounterIndex, v => {
                                        if (!v.damageTweaks.has(suggestion.harder!.damageTweaks.creatureId)) v.damageTweaks.set(suggestion.harder!.damageTweaks.creatureId, new Map())
                                        const dmgTweak = v.damageTweaks.get(suggestion.harder!.damageTweaks.creatureId)!
                                        dmgTweak.set(suggestion.harder!.damageTweaks.actionId, suggestion.harder!.damageTweaks.newValue)
                                    })}>
                                        Harder
                                    </button>
                                </>}
                            </div>

                            {(() => {
                                const tweaks = value.encounterTweaks.get(suggestion.encounterIndex)
                                const hasTweaks = !!tweaks && (!!tweaks.damageTweaks.size || !!tweaks.hpTweaks.size)
                                if (!hasTweaks) return null
                                
                                return (
                                    <div className={styles.tweaksRecap}>
                                        Suggested Tweaks:

                                        <ul>
                                            {Array.from(tweaks.hpTweaks.entries()).map(([creatureId, newHP]) => {
                                                const encounter = encounters[suggestion.encounterIndex]
                                                const creature = encounter.monsters.find(c => c.id === creatureId)

                                                if (!creature) return null

                                                return (
                                                    <li key={creatureId}>
                                                        <b>{creature.name}:</b> change hit points to {newHP}
                                                    </li>
                                                )
                                            })}
                                            {Array.from(tweaks.damageTweaks.entries()).map(([creatureId, actionDamageMap]) => {
                                                const encounter = encounters[suggestion.encounterIndex]
                                                const creature = encounter.monsters.find(c => c.id === creatureId)
                                                
                                                if (!creature) return null

                                                return (
                                                    Array.from(actionDamageMap.entries()).map(([actionId, newDamage]) => {
                                                        const action = creature.actions.find((a): a is AtkAction => a.id === actionId)

                                                        if (!action) return null

                                                        let damageFormula: string = String(newDamage)
                                                        let minDieCount = Infinity
                                                        for (let dieSize of [4,6,8]) {
                                                            const avg = dieSize / 2 + 0.5
                                                            const dieCount = Math.round(newDamage / avg)
                                                            if ((dieCount === 0) || (dieCount > minDieCount)) continue;
                                                            
                                                            const actualAvg = avg * dieCount
                                                            const distance = Math.round(newDamage - actualAvg)
                                                            if (distance < 0) continue;

                                                            damageFormula = `${dieCount}d${dieSize}` + (distance > 0 ? `+${distance}` : '')
                                                            minDieCount = dieCount
                                                        }

                                                        return (
                                                            <li>
                                                                <b>{creature.name}:</b> change {action.name} damage to {newDamage} {minDieCount < Infinity ? `(${damageFormula})` : null}
                                                            </li>
                                                        )
                                                    })
                                                )
                                            })}
                                        </ul>
                                    </div>
                                )
                            })()}
                        </div>
                    ))}
                </>}
            </div>
        </div>
    </>
}

const FormFieldWithHelp: FC<{ children: ReactNode, tooltip: ReactNode }> = ({ children, tooltip }) => {
    const [collapsed, setCollapsed] = useState(true)

    return (
        <div className={styles.field}>
            <div className={styles.header}>
                <div className={styles.content}>
                    {children}
                </div>
                <button
                    className={styles.helpBtn}
                    onClick={() => setCollapsed(!collapsed)}>
                    <FontAwesomeIcon icon={faQuestionCircle} />
                </button>
            </div>
            
            <div className={`${styles.tooltip} ${collapsed && styles.collapsed}`}>
                <div className={styles.wrapper}>
                    {tooltip}
                </div>
            </div>
        </div>
    )
}


export default SimSettingsForm