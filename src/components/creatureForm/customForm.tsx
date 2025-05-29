import { FC, useEffect, useState } from "react"
import { Action, ActionSchema, Creature } from "../../model/model"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFolder, faPaste, faPlus, faSave } from "@fortawesome/free-solid-svg-icons"
import styles from './customForm.module.scss'
import { clone } from "../../model/utils"
import ActionForm from "./actionForm"
import DecimalInput from "../utils/DecimalInput"
import { v4 as uuid } from 'uuid'
import LoadCreatureForm, { saveCreature } from "./loadCreatureForm"

type PropType = {
    value: Creature,
    onChange: (newvalue: Creature) => void,
}

const CustomForm:FC<PropType> = ({ value, onChange }) => {
    const [isLoading, setIsLoading] = useState(false)
    const [parseError, setParseError] = useState(false)

    function update(callback: (valueClone: Creature) => void) {
        const valueClone = clone(value)
        callback(valueClone)
        onChange(valueClone)
    }

    function createAction() {
        update(v => { v.actions.push({
            id: uuid(),
            actionSlot: 0,
            name: '',
            freq: 'at will',
            condition: 'default',
            targets: 1,
            type: 'atk',
            dpr: 0,
            toHit: 0,
            target: 'enemy with least HP',
        }) })
    }

    async function handlePaste() {
        try {
            // 1. Attempt to parse the clipboard's content as an action
            const clipboardContent = await navigator.clipboard.readText()
            const obj = JSON.parse(clipboardContent)
            const parsed = ActionSchema.parse(obj)

            // 2. Ensure there are no id conflicts
            parsed.id = uuid()
            if (parsed.type === "multi") {
                parsed.actions.forEach(subAction => { subAction.id = uuid() })
            }

            // 3. add the new action
            update(v => { v.actions.push(parsed) })
            setParseError(false)
        } catch (e) {
            console.error(e)
            setParseError(true)
        }
    }

    // Listen to ctrl+V events
    useEffect(function pasteListener() {
        if (typeof window === "undefined") return;

        function listener() {
            if (document.activeElement?.localName === "input") return;

            handlePaste()
        }

        window.addEventListener("paste", listener)

        return () => {
            window.removeEventListener("paste", listener)
        }
    }, [value])

    function updateAction(index: number, newValue: Action) {
        update(v => { v.actions[index] = newValue })
    }

    function deleteAction(index: number) {
        update(v => { v.actions.splice(index, 1) })
    }

    const canSaveTemplate = !!localStorage && !!localStorage.getItem('useLocalStorage')

    return (
        <div className={styles.customForm}>
            <section>
                <h3>Name</h3>
                <div className={styles.nameContainer}>
                    <input type='text' value={value.name} onChange={e => update(v => { v.name = e.target.value })} />
                    { canSaveTemplate ? (
                        <>
                            <button onClick={() => saveCreature(value)}>
                                <FontAwesomeIcon icon={faSave} />
                                <span className={styles.btnText}>Save</span>
                            </button>
                            <button onClick={() => setIsLoading(true)}>
                                <FontAwesomeIcon icon={faFolder} />
                                <span className={styles.btnText}>Load</span>
                            </button>
                        </>
                    ) : null }
                </div>
            </section>
            <section>
                <h3>Hit Points</h3>
                <DecimalInput min={0} value={value.hp} onChange={hp => update(v => { v.hp = hp || 0 })} />
            </section>
            <section>
                <h3>Armor Class</h3>
                <DecimalInput min={0} value={value.AC} onChange={ac => update(v => { v.AC = ac || 0 })} />
            </section>
            <section className="tooltipContainer">
                <h3>Average Save</h3>
                <DecimalInput min={0} value={value.saveBonus} onChange={save => update(v => { v.saveBonus = save || 0 })} />
                <div className="tooltip">Average of all saves' bonuses. For player characters, you can use the Proficiency Bonus. For monsters, either calculate it, or just use half of the monster's CR.</div>
            </section>
            <section>
                <h3>Legendary Saves</h3>
                <DecimalInput min={0} value={value.legendarySaves || 0} onChange={save => update(v => { v.legendarySaves = save || 0 })} />
            </section>
            
            <h3 className={styles.actionsHeader}>
                <span className={styles.label}>Actions</span>
                <button
                    onClick={handlePaste}
                    className={styles.createActionBtn}>
                        <FontAwesomeIcon icon={faPaste} />
                        <label>Paste Action</label>
                </button>
                <button
                    onClick={createAction}
                    className={styles.createActionBtn}>
                        <FontAwesomeIcon icon={faPlus} />
                        <label>Create Action</label>
                </button>
            </h3>

            { parseError && (
                <div className={styles.parseError}>
                    Error: unable to parse action data from your clipboard!

                    <button onClick={() => setParseError(false)}>
                        Dismiss
                    </button>
                </div>
            )}

            <div className={styles.actions}>
                { value.actions.map((action, index) => (
                    <ActionForm
                        key={action.id}
                        value={action}
                        onChange={(a) => updateAction(index, a)}
                        onDelete={() => deleteAction(index)}
                        onMoveUp={(index <= 0) ? undefined : () => update(v => {                            
                            v.actions[index] = v.actions[index - 1]
                            v.actions[index - 1] = action
                        })}
                        onMoveDown={(index >= value.actions.length - 1) ? undefined : () => update(v => {
                            v.actions[index] = v.actions[index + 1]
                            v.actions[index + 1] = action
                        })}
                    />
                ))}
            </div>

            { isLoading ? (
                <LoadCreatureForm 
                    onLoad={(creature) => { onChange(creature); setIsLoading(false) }} 
                    onCancel={() => setIsLoading(false)} />
            ) : null}
        </div>
    )
}

export default CustomForm