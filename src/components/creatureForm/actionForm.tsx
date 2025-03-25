import { FC, useEffect, useMemo, useRef, useState } from "react"
import { Action, AllyTarget, AtkAction, Buff, BuffAction, DebuffAction, DiceFormula, EnemyTarget, FinalAction, Frequency, HealAction, MultiAction, TemplateAction } from "../../model/model"
import styles from './actionForm.module.scss'
import { clone } from "../../model/utils"
import { ActionType, BuffDuration, ActionCondition, CreatureConditionList, CreatureCondition, ActionSlots } from "../../model/enums"
import Select from "../utils/select"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faChevronDown, faChevronUp, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons"
import DecimalInput from "../utils/DecimalInput"
import DiceFormulaInput from "../utils/diceFormulaInput"
import { ActionTemplates, getFinalActions } from "../../data/actions"
import { v4 as uuid } from 'uuid'

type PropType = {
    value: Action,
    onChange: (newvalue: Action) => void,
    onDelete: () => void,
    onMoveUp?: () => void,
    onMoveDown?: () => void,
    formType?: "multiaction"
}

type Options<T> = { value: T, label: string}[]

const srFreq: Frequency = { reset: "sr", uses: 1 }
const lrFreq: Frequency = { reset: "lr", uses: 1 }
const rechargeFreq: Frequency = { reset: "recharge", cooldownRounds: 2 }
const FreqOptions: Options<Frequency> = [
    { value: 'at will', label: 'At will' },
    { value: '1/fight', label: '1/short rest' },
    { value:  srFreq, label: 'X/short rest' },
    { value: '1/day', label: '1/day' },
    { value:  lrFreq, label: 'X/long rest' },
    { value:  rechargeFreq, label: 'Every X rounds' },
]

const ConditionOptions: Options<ActionCondition> = [
    { value:'default', label: 'Default' },
    { value:'ally at 0 HP', label: 'There is an ally at 0 HP' },
    { value:'ally under half HP', label: 'An ally has less than half their maximum HP' },
    { value:'is available', label: 'A use of this action is available' },
    { value:'is under half HP', label: 'This creature is under half its maximum HP' },
    { value:'has no THP', label: 'This creature has no temporary HP' },
    { value:'not used yet', label: 'This action has not been used yet this encounter' },
    { value:'enemy count one', label: 'There is only one enemy' },
    { value:'enemy count multiple', label: 'There are at least two enemies' },
]

const TypeOptions: Options<ActionType> = [
    { value: 'template', label: 'Common Spell' },
    { value: 'atk', label: 'Attack' },
    { value: 'heal', label: 'Heal' },
    { value: 'buff', label: 'Buff' },
    { value: 'debuff', label: 'Debuff' },
    { value: 'multi', label: 'Multiple Actions' },
]

const ActionOptions: Options<number> = Object.entries(ActionSlots).map(([label, value]) => ({label, value}))

const TargetCountOptions: Options<number> = [
    { value: 1, label: 'Single target' },
    { value: 2, label: 'Multi target' },
    { value: 3, label: '3 targets' },
    { value: 4, label: '4 targets' },
    { value: 5, label: '5 targets' },
    { value: 6, label: '6 targets' },
    { value: 7, label: '7 targets' },
    { value: 8, label: '8 targets' },
    { value: 9, label: '9 targets' },
    { value: 10, label: '10 targets' },
    { value: 11, label: '11 targets' },
    { value: 12, label: '12 targets' },
    { value: 13, label: '13 targets' },
    { value: 14, label: '14 targets' },
    { value: 15, label: '15 targets' },
    { value: 10000, label: 'Target everything' },
]

const HitCountOptions: Options<number> = [
    { value: 1, label: '1 hit' },
    { value: 2, label: '2 hits' },
    { value: 3, label: '3 hits' },
    { value: 4, label: '4 hits' },
    { value: 5, label: '5 hits' },
    { value: 6, label: '6 hits' },
    { value: 7, label: '7 hits' },
    { value: 8, label: '8 hits' },
    { value: 9, label: '9 hits' },
    { value: 10, label: '10 hits' },
]

const EnemyTargetOptions: Options<EnemyTarget> = [
    { value: 'enemy with least HP', label: 'Enemy with least HP' },
    { value: 'enemy with most HP', label: 'Enemy with most HP' },
    { value: 'enemy with highest DPR', label: 'Enemy with highest DPR' },
    { value: 'enemy with lowest AC', label: 'Enemy with lowest AC' },
    { value: 'enemy with highest AC', label: 'Enemy with highest AC' },
]

const AllyTargetOptions: Options<AllyTarget> = [
    { value: 'self', label: 'Self' },
    { value: 'ally with the least HP', label: 'Ally with the least HP' },
    { value: 'ally with the most HP', label: 'Ally with the most HP' },
    { value: 'ally with the highest DPR', label: 'Ally with the highest DPR' },
    { value: 'ally with the lowest AC', label: 'Ally with the lowest AC' },
    { value: 'ally with the highest AC', label: 'Ally with the highest AC' },
]

const BuffDurationOptions: Options<BuffDuration> = [
    { value: '1 round', label: "1 Round" },
    { value: 'repeat the save each round', label: "Repeat the save each round" },
    { value: 'entire encounter', label: 'Entire Encounter' },
    { value: 'until next attack taken', label: 'Until the next attack taken' },
    { value: 'until next attack made', label: 'Until the next attack made' }
]

const BuffStatOptions: Options<keyof Omit<Buff, 'duration'|'displayName'>> = [
    { value: 'condition', label: 'Condition' },
    { value: 'ac', label: 'Armor Class' },
    { value: 'save', label: 'Bonus to Saves' },
    { value: 'toHit', label: 'Bonus to hit' },
    { value: 'dc', label: 'Save DC Bonus' },
    { value: 'damage', label: 'Extra Damage' },
    { value: 'damageReduction', label: 'Damage Reduction' },
    { value: 'damageMultiplier', label: 'Damage Multiplier' },
    { value: 'damageTakenMultiplier', label: 'Damage Taken Multiplier' },
]

const AtkOptions: Options<boolean> = [
    { value: true, label: 'Save DC:' },
    { value: false, label: 'To Hit:' },
]

function newSubAction(): Omit<AtkAction, 'actionSlot'> {
    return {
        id: uuid(),
        name: '',
        freq: 'at will',
        condition: 'default',
        targets: 1,
        type: 'atk',
        dpr: 0,
        toHit: 0,
        target: 'enemy with least HP',
    }
}

const BuffForm:FC<{value: Buff, onUpdate: (newValue: Buff) => void}> = ({ value, onUpdate }) => {
    const [modifiers, setModifiers] = useState<(keyof Omit<Buff, 'duration'>)[]>(Object.keys(value).filter(key => (key !== 'duration')) as any)

    useEffect(function onBuffUpdated() {
        setModifiers(Object.keys(value).filter(key => (key !== 'duration')) as any)
    }, [value])

    function setModifier(index: number, newValue: keyof Omit<Buff, 'duration'> | null) {
        const oldModifier = modifiers[index]
        if (oldModifier === newValue) return

        const buffClone = clone(value)
        delete buffClone[oldModifier]
        onUpdate(buffClone)

        const modifiersClone = clone(modifiers)
        if (newValue === null) modifiersClone.splice(index, 1)
        else modifiersClone[index] = newValue
        setModifiers(modifiersClone)
    }

    function updateValue(modifier: keyof Omit<Buff, 'duration'|'condition'|'displayName'>, newValue: number) {
        const buffClone = clone(value)
        buffClone[modifier] = newValue
        onUpdate(buffClone)
    }

    function updateDiceFormula(modifier: string, newValue: DiceFormula) {
        const buffClone = clone(value);
        (buffClone as any)[modifier] = newValue
        onUpdate(buffClone)
    }

    function updateCondition(newValue: CreatureCondition|undefined) {
        const buffClone = clone(value)
        buffClone.condition = newValue
        onUpdate(buffClone)
    }

    return (
        <>
            { (modifiers.length > 0) && "Effects:" }
            {modifiers.map((modifier, index) => (
                <div key={modifier} className={styles.modifier}>
                    <Select 
                        value={modifier} 
                        onChange={newValue => setModifier(index, newValue)} 
                        options={BuffStatOptions.filter(option => (modifier === option.value) || !modifiers.includes(option.value))}
                    />
                    { ((modifier === 'damageMultiplier') || (modifier === 'damageTakenMultiplier')) ? (
                        <DecimalInput
                            value={value[modifier]}
                            onChange={v => updateValue(modifier, v || 0)}
                        />
                    ) : (modifier === 'condition') ? (
                        <Select
                            value={value.condition}
                            options={CreatureConditionList.map(condition => ({ value: condition, label: condition }))}
                            onChange={(newCondition) => updateCondition(newCondition)}
                        />
                    ) : (
                        <DiceFormulaInput 
                            value={value[modifier]} 
                            onChange={v => updateDiceFormula(modifier, v || 0)}
                        />
                    )}
                    <button className={styles.controlBtn} onClick={() => setModifier(index, null)}>
                        <FontAwesomeIcon icon={faTrash} />
                    </button>
                </div>
            ))}
        </>
    )
}

enum FormActionField {
    "Limited Resource",
    "Condition",
    "Effect",
    "Action",
}

const ActionForm:FC<PropType> = ({ value, onChange, onDelete, onMoveUp, onMoveDown, formType }) => {
    const [addedFields, setAddedFields] = useState<FormActionField[]>([])
    const [isAddFieldMenuOpen, setAddFieldMenuOpen] = useState(false)
    const addFieldMenuRef = useRef<HTMLDivElement>(null)

    function removeField(field: FormActionField) {
        const index = addedFields.indexOf(field)

        if (index >= 0) addedFields.splice(index, 1)
    }

    const addableActions = useMemo(() => {
        let result: FormActionField[] = []

        if ((value.freq === "at will") && (!addedFields.includes(FormActionField["Limited Resource"]))) result.push(FormActionField["Limited Resource"])
        if ((value.condition === "default") && (!addedFields.includes(FormActionField.Condition))) result.push(FormActionField.Condition)
        if ((value.type === "atk") || (value.type === "buff") || (value.type === "debuff")) result.push(FormActionField.Effect)
        if (value.type === "multi") result.push(FormActionField.Action)

        return result
    }, [value, addedFields])

    useEffect(function removeAddFieldMenu() {
        if (!isAddFieldMenuOpen) return;
        if (!addFieldMenuRef.current) return;

        function closeMenu(e: MouseEvent) {
            const elem = e.target as HTMLElement
            const isInside = addFieldMenuRef.current!.contains(elem)
            
            if (!isInside) setAddFieldMenuOpen(false)
        }

        window.addEventListener("click", closeMenu)

        return () => { window.removeEventListener("click", closeMenu) }
    }, [isAddFieldMenuOpen, addFieldMenuRef])

    function update(callback: (valueClone: typeof value) => void) {
        const valueClone = clone(value)
        callback(valueClone)
        onChange(valueClone)
    }

    function updateFinalAction(callback: (valueClone: FinalAction) => void) {
        if (value.type === 'template') return
        if (value.type === 'multi') return

        const valueClone = clone(value)
        callback(valueClone)
        onChange(valueClone)
    }

    function updateTemplateAction(callback: (valueClone: TemplateAction) => void) {
        if (value.type !== 'template') return

        const valueClone = clone(value)
        callback(valueClone)
        onChange(valueClone)
    }

    function updateMultiAction(callback: (valueclone: MultiAction) => void) {
        if (value.type !== "multi") return

        const valueClone = clone(value)
        callback(valueClone)
        onChange(valueClone)
    }

    function updateFrequency(freq: Frequency) {
        const v = clone(value)
        
        v.freq = (freq === v.freq) ? v.freq
            : (typeof freq === 'string') ? freq
            : (typeof v.freq === 'string') ? clone(freq)
            : (v.freq.reset !== freq.reset) ? clone(freq)
            : v.freq

        onChange(v)
    }

    function updateRiderEffect(callback: (riderEffect: { dc: number, buff: Buff }) => void) {
        update((actionClone) => {
            const atkAction = (actionClone as AtkAction)
            atkAction.riderEffect ||= { dc: 0, buff: { duration: '1 round' } }
            callback(atkAction.riderEffect)
        })
    }

    function updateType(type: ActionType) {
        if (type === value.type) return

        const finalAction = (value.type === "template") ? getFinalActions(value)[0] : value

        const common = {
            id: value.id,
            name: finalAction.name,
            actionSlot: finalAction.actionSlot,
            condition: finalAction.condition,
            freq: finalAction.freq,
        }

        const templateAction: TemplateAction = {
            id: value.id,
            type: 'template',
            condition: finalAction.condition,
            freq: finalAction.freq,
            templateOptions: { templateName: 'Fireball', saveDC: 10, toHit: 10, target: 'enemy with least HP' },
        }

        switch (type) {
            case "template": return onChange(templateAction)
            case "atk": return onChange({...common, type, target: "enemy with most HP", targets: 1, dpr: 0, toHit: 0 })
            case "heal": return onChange({...common, type, amount: 0, target: "ally with the least HP", targets: 1, })
            case "buff": return onChange({...common, type, target: "ally with the highest DPR", targets: 1, buff: { duration: '1 round' } })
            case "debuff": return onChange({...common, type, target: "enemy with highest DPR", targets: 1, saveDC: 10, buff: { duration: '1 round' } })
            case "multi": return onChange({ ...common, type, actions: [newSubAction(), newSubAction()] })
        }
    }

    function onTemplateChange(templateName: keyof typeof ActionTemplates) {
        if (value.type !== 'template') return

        const template = ActionTemplates[templateName]
        const enemyTarget: EnemyTarget = 'enemy with least HP'
        const allyTarget: AllyTarget = 'ally with the least HP'
        const defaultTarget: EnemyTarget|AllyTarget = ((template.type === 'atk') || (template.type === 'debuff')) ? enemyTarget : allyTarget

        onChange({
            ...value,
            templateOptions: {
                templateName,
                toHit: value.templateOptions.toHit || 0,
                saveDC: value.templateOptions.saveDC || 0,
                target: value.templateOptions.target || defaultTarget,
            },
        })
    }

    return (
        <div className={styles.actionForm}>
            <div className={styles.arrowBtns}>
                <button
                    className={styles.controlBtn}
                    onClick={onMoveUp}
                    disabled={!onMoveUp}>
                        <FontAwesomeIcon icon={faChevronUp} />
                </button>
                <button
                    className={styles.controlBtn}
                    onClick={onMoveDown}
                    disabled={!onMoveDown}>
                        <FontAwesomeIcon icon={faChevronDown} />
                </button>
            </div>

            <button
                className={styles.controlBtn}
                onClick={onDelete}>
                    <FontAwesomeIcon icon={faTrash} />
            </button>

            { value.type !== 'template' ? (
                <>
                    <input 
                        type='text' 
                        value={value.name} 
                        onChange={(e) => update(v => {
                            if (v.type === "template") return;
                            v.name = e.target.value.length < 100 ? e.target.value : v.name 
                        })}
                        placeholder="Action name..." 
                        style={{ minWidth: `${value.name.length}ch` }}
                    />
                    
                    { formType !== "multiaction" && (
                        <div className="tooltipContainer">
                            <Select
                                value={value.actionSlot}
                                options={ActionOptions}
                                onChange={actionSlot => updateFinalAction(v => { v.actionSlot = actionSlot })} />

                            <div className="tooltip">
                                <b>Action slot:</b> each action slot can be used once per round, except:

                                <ul>
                                    <li>"When reducing an enemy to 0 hit points"</li>
                                    <li>"When the encounter starts"</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </>
            ) : null }

            <div className="tooltipContainer">
                <Select
                    value={value.type}
                    options={formType !== "multiaction" ? TypeOptions : TypeOptions.filter(type => type.value !== "multi")}
                    onChange={updateType} />

                <div className="tooltip">
                    <b>Action Type</b>
                </div>
            </div>

            { value.type === 'template' ? (
                <div className="tooltipContainer">
                    <Select
                        value={value.templateOptions.templateName}
                        options={Object.keys(ActionTemplates).map(key => ({ value: key as keyof typeof ActionTemplates, label: key }))}
                        onChange={onTemplateChange}/>

                    <div className="tooltip">
                        <b>Spell Name</b>
                    </div>
                </div>
            ) : null }

            { ((value.freq !== "at will") || addedFields.includes(FormActionField["Limited Resource"])) && (
                <div className={"tooltipContainer " + (addedFields.includes(FormActionField["Limited Resource"]) && styles.pristine)}>
                    <Select 
                        value={
                            typeof value.freq === 'string' ? value.freq
                          : value.freq.reset === 'sr' ? srFreq
                          : value.freq.reset === 'lr' ? lrFreq
                          : value.freq.reset === 'recharge' ? rechargeFreq
                          : 'at will'
                        }
                        options={FreqOptions}
                        onChange={freq => {
                            updateFrequency(freq)
                            if (freq === "at will") removeField(FormActionField["Limited Resource"])
                        }} />
                    
                    <div className="tooltip">
                        <b>Frequency:</b> does this action have limited uses?
                    </div>
                </div>
            )}

            { typeof value.freq !== 'string' ? (
                value.freq.reset === 'recharge' ? (
                    <>
                        Cooldown in rounds:
                        <input 
                            type='number'
                            min={2}
                            step={1}
                            className={value.freq.cooldownRounds < 2 ? styles.invalid : ''}
                            value={value.freq.cooldownRounds}
                            onChange={e => update(v => { (v.freq as any).cooldownRounds = Number(e.target.value || 0) })}/>
                    </>
                ) : (
                    <>
                        Uses:
                        <input 
                            type='number'
                            min={1}
                            step={1}
                            className={value.freq.uses < 1 ? styles.invalid : ''}
                            value={value.freq.uses}
                            onChange={e => update(v => { (v.freq as any).uses = Number(e.target.value || 0) })}/>
                    </>
                )
            ) : null }
            
            { ((value.type === 'atk') && (!value.useSaves)) ? (
                <Select value={value.targets} options={HitCountOptions} onChange={targets => updateFinalAction(v => v.targets = targets)} />
            ) : ((value.type !== 'template') && (value.type !== 'multi')) ? (
                <Select value={value.targets} options={TargetCountOptions} onChange={targets => updateFinalAction(v => { v.targets = targets })} />
            ) : null }

            { ((value.condition !== "default") || addedFields.includes(FormActionField.Condition)) && (
                <div className={`${styles.conditionContainer} ${addedFields.includes(FormActionField.Condition) && styles.pristine}`}>
                    Use this action if:
                    <Select
                        value={value.condition}
                        options={ConditionOptions}
                        onChange={condition => update(v => {
                            v.condition = condition
                            if (condition === "default") removeField(FormActionField.Condition)
                        })} />
                </div>
            )}

            { (value.type === "atk") ? (
                <>
                    <div className="tooltipContainer">
                        <Select
                            value={!!value.useSaves} 
                            options={AtkOptions} 
                            onChange={useSaves => update(v => {
                                const atk = (v as AtkAction);
                                if (atk.useSaves !== useSaves) atk.targets = 1
                                atk.useSaves = useSaves 
                            })} />

                        <div className="tooltip">
                            <div><b>To Hit:</b> this action uses an attack roll</div>
                            <div><b>Save DC:</b> this action uses a saving throw</div>
                        </div>
                    </div>
                    <DiceFormulaInput value={value.toHit} onChange={toHit => update(v => { (v as AtkAction).toHit = toHit || 0 })} />
                    Damage: 
                    <DiceFormulaInput value={value.dpr} onChange={dpr => update(v => { (v as AtkAction).dpr = dpr || 0 })} canCrit={!value.useSaves} />
                    
                    { !!value.useSaves ? (
                        <>
                            Save for half?
                            <Select 
                                value={!!value.halfOnSave}
                                options={[ { value: true, label: 'Yes' }, { value: false, label: 'No' } ]}
                                onChange={halfOnSave => update(v => { (v as AtkAction).halfOnSave = halfOnSave })} />
                        </>
                    ) : null }
                    
                    Target:
                    <Select value={value.target} options={EnemyTargetOptions} onChange={target => updateFinalAction(v => { v.target = target })} />

                    { (!!value.riderEffect) ? (
                        <>
                            Save DC:
                            <DecimalInput value={value.riderEffect.dc} onChange={dc => updateRiderEffect(e => { e.dc = dc || 0 })} />
                            Duration:
                            <Select value={value.riderEffect.buff.duration} options={BuffDurationOptions} onChange={duration => updateRiderEffect(e => { e.buff.duration = duration })} />
                            
                            <BuffForm
                                value={value.riderEffect.buff}
                                onUpdate={newValue => {
                                    const { duration, displayName, magnitude, ...modifiers } = newValue

                                    if (!Object.keys(modifiers).length) {
                                        update(clone => delete (clone as AtkAction).riderEffect)
                                    } else {
                                        updateRiderEffect(e => { e.buff = newValue })
                                    }
                                }} />
                        </>
                    ) : null }
                </>
            ) : null }
            { (value.type === "heal") ? (
                <>
                    <div className="tooltipContainer">
                        <Select
                            value={!!value.tempHP}
                            options={[ {value: true, label: 'Temp HP:'}, {value: false, label: 'Heal Amount:'} ]}
                            onChange={tempHP => update(v => { (v as HealAction).tempHP = tempHP })}/>

                        <div className="tooltip">
                            <div><b>Heal Amount:</b> this action will heal the target up to its max HP.</div>
                            <div><b>Temp HP:</b> this action will grant temporary hit points if the amount is larger than the target's current temporary hit points.</div>
                        </div>
                    </div>
                    <DiceFormulaInput value={value.amount} onChange={heal => update(v => { (v as HealAction).amount = heal || 0 })} />
                    Target:
                    <Select value={value.target} options={AllyTargetOptions} onChange={target => updateFinalAction(v => { v.target = target })} />
                </>
            ) : null }
            { (value.type === "buff") ? (
                <>
                    Target:
                    <Select value={value.target} options={AllyTargetOptions} onChange={target => updateFinalAction(v => { v.target = target })} />
                    Duration:
                    <Select value={value.buff.duration} options={BuffDurationOptions} onChange={duration => update(v => { (v as BuffAction).buff.duration = duration })} />
                    <BuffForm value={value.buff} onUpdate={newValue => update(v => { (v as BuffAction).buff = newValue })} />
                </>
            ) : null }
            { (value.type === "debuff") ? (
                <>
                    Target:
                    <Select value={value.target} options={EnemyTargetOptions} onChange={target => updateFinalAction(v => { v.target = target })} />
                    Duration:
                    <Select value={value.buff.duration} options={BuffDurationOptions} onChange={duration => update(v => { (v as DebuffAction).buff.duration = duration })} />
                    Save DC:
                    <input type='number' value={value.saveDC} onChange={e => update(v => { (v as DebuffAction).saveDC = Number(e.target.value) })} />
                    <BuffForm value={value.buff} onUpdate={newValue => update(v => { (v as DebuffAction).buff = newValue })} />
                </>
            ) : null }
            { (value.type === "template") ? (() => {
                const template = ActionTemplates[value.templateOptions.templateName]

                const targetForm = template.target ? null : (
                    <>
                        Target:
                        <Select 
                            value={value.templateOptions.target} 
                            options={((template.type === 'atk') || (template.type === 'debuff')) ? EnemyTargetOptions : AllyTargetOptions}
                            onChange={target => updateTemplateAction(v => { v.templateOptions.target = target })}/>
                    </>
                )

                if (template.type === 'atk') return (
                    <>
                        { template.useSaves ? 'Save DC:' : 'To hit:' }
                        <DiceFormulaInput value={value.templateOptions.toHit} onChange={toHit => updateTemplateAction(v => { v.templateOptions.toHit = toHit || 0 })} />
                        { template.riderEffect ? (
                            <>
                                Save DC for the additional effects:
                                <input type='number' value={value.templateOptions.saveDC} onChange={e => updateTemplateAction(v => { v.templateOptions.saveDC = Number(e.target.value) })} />
                            </>
                        ) : null}
                        {targetForm}
                    </>
                )
                if (template.type === 'debuff') return (
                    <>
                        Save DC:
                        <input 
                            type='number' 
                            value={value.templateOptions.saveDC} 
                            onChange={e => updateTemplateAction(v => { v.templateOptions.saveDC = Number(e.target.value) })} />
                        {targetForm}
                    </>
                )

                return targetForm
            })() : null }

            {(addableActions.length > 0) && (
                <div className={styles.addFieldBtnContainer} ref={addFieldMenuRef}>
                    <button className={styles.addFieldBtn} onClick={() => setAddFieldMenuOpen(true)}>
                        <FontAwesomeIcon icon={faPlus} />
                    </button>
                    { isAddFieldMenuOpen && (
                        <div className={styles.addFieldMenu}>
                            { addableActions.map(addable => (
                                <button onClick={() => {
                                    setAddFieldMenuOpen(false)

                                    if (addable === FormActionField["Limited Resource"]) setAddedFields([...addedFields, FormActionField["Limited Resource"]])
                                    if (addable === FormActionField.Condition) setAddedFields([...addedFields, FormActionField.Condition])

                                    if (addable === FormActionField.Effect) {
                                        type BuffModifier = keyof Omit<Buff, 'duration'|'displayName'>
                                        
                                        if ((value.type === "buff") || (value.type === "debuff")) {
                                            update(clone => {
                                                const newModifier: undefined|BuffModifier = BuffStatOptions.find(({ value: buffType }) => !Object.keys(value.buff).includes(buffType))?.value
                                                if (!newModifier) return;
                                                
                                                if (newModifier === "condition") {
                                                    ((clone as BuffAction).buff!).condition = "Poisoned"
                                                } else {
                                                    ((clone as BuffAction).buff!)[newModifier] = 0
                                                }
                                            })
                                        } else if (value.type === "atk") {
                                            update(clone => {
                                                const newModifier: undefined|BuffModifier = BuffStatOptions.find(({ value: buffType }) => !Object.keys(value.riderEffect?.buff || {}).includes(buffType))?.value
                                                if (!newModifier) return;
                                                
                                                if (!(clone as AtkAction).riderEffect) {
                                                    (clone as AtkAction).riderEffect = { dc: 10, buff: { duration: "1 round" } }
                                                }

                                                if (newModifier === "condition") {
                                                    ((clone as AtkAction).riderEffect!.buff!).condition = "Poisoned"
                                                } else {
                                                    ((clone as AtkAction).riderEffect!.buff!)[newModifier] = 0
                                                }
                                            })
                                        }
                                    }

                                    if ((addable === FormActionField.Action) && (value.type === "multi")) {
                                        updateMultiAction(clone => {
                                            clone.actions.push(newSubAction())
                                        })
                                    }
                                }}>
                                    {FormActionField[addable]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            { (value.type === "multi") && <>
                <div className={styles.multiContainer}>
                    {value.actions.map((subAction, i) => (
                        <ActionForm
                            key={subAction.id}
                            formType="multiaction"
                            value={subAction.type === "template" ? subAction: ({ ...subAction, actionSlot: 0 })}
                            onChange={newValue => {
                                if (newValue.type === "multi") return

                                let cleanValue = value.actions[i];
                                if (newValue.type === "template") {
                                    cleanValue = newValue
                                } else {
                                    const { actionSlot, ...otherFields } = newValue
                                    cleanValue = otherFields
                                }

                                updateMultiAction(clone => { clone.actions[i] = cleanValue })
                            }}
                            onDelete={() => {
                                updateMultiAction(clone => { delete clone.actions[i]})
                            }}
                            onMoveDown={((value.actions.length <= 1) || (i + 1 >= value.actions.length)) ? undefined : () => updateMultiAction(clone => {
                                const tmp = clone.actions[i + 1]
                                clone.actions[i + 1] = clone.actions[i]
                                clone.actions[i] = tmp
                            })}
                            onMoveUp={((value.actions.length <= 1) || (i - 1 < 0)) ? undefined : () => updateMultiAction(clone => {
                                const tmp = clone.actions[i - 1]
                                clone.actions[i - 1] = clone.actions[i]
                                clone.actions[i] = tmp
                            })}
                        />
                    ))}
                </div>
            </>}
        </div>
    )
}

export default ActionForm