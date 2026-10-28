# Traveler-companion Mondstadt mainline depth test — 2026-10-24

## Scope and current stop

This is an in-progress live dialogue test in the DSH desktop app. It uses the new solo slot `mainline_depth_companion_20261024`; older saves were not opened, edited, or deleted. The PC is Linchuan, a Mondstadt courier with no Vision and a one-handed sword. The test began with Traveler and Paimon in the same opening scene; Traveler was marked joined only after the player explicitly agreed.

The test is paused after the night meeting in the Knights of Favonius side hall. The next established scene is departure from the North Gate at dawn to inspect the old stone steps, up to the perimeter Jean set. Mondstadt's Stormterror crisis is not resolved: the Abyss Order's actions are suspected but not confirmed in the field, Dvalin has not been directly examined, and Traveler has not yet purified him.

## Rule changes exercised

The following documents were updated before this test:

- `docs/rules/mainline-rules.md` and its runtime mirror `code/dsh-trpg/prompt/mainline-rules.md`: investigation should move from observable harm through bounded evidence to a concrete next action, then to conflict and aftermath; do not pad the chain with duplicate clues. Mondstadt needs to show Dvalin's corruption, Abyss Order activity, the old wound and resentment, an actual conflict, and Traveler's established purification role.
- `docs/gm/gm-handbook.md` and `code/dsh-trpg/prompt/gm-system.md`: keep the PC central in important scenes while Traveler acts as a real companion; prevent both shallow summary and chore-like delay; distinguish observed fact from inference and preserve uncertainty.

No code, release package, or pre-existing save was changed as part of this live test.

## Observed play

1. The opening put the PC, Traveler, and Paimon together during a windstorm affecting the Mondstadt gate and a courier cart. Traveler helped stabilize the cart and discussed the local crisis. Party status was updated only after explicit consent.
2. At the forest edge, the PC investigated gray-red residue on a storm-damaged branch. The public check showed `3 + 6 + Perception 2 = 11`, success. The residue was on the windward side; this established wind-borne transport, not its source. Traveler contributed a comparison and proposed a second location.
3. A later track-reading check showed `1 + 2 + Perception 2 + Road Familiarity 1 = 6`, failure, with the risk announced beforehand. The group was surprised by two hilichurls. Combat ran four rounds. Linchuan attacked, defended, and chose not to pursue; Traveler attacked, defended, took damage, and coordinated with Linchuan. The fight yielded a dropped herbalist's tool and more residue evidence. This was an actual encounter, not an avoidable conversation loop.
4. The missing herbalist, Yohn, became a direct rescue objective. The group followed a wind gap and a one-sided residue trail. Linchuan found Yohn in a crevice, returned for rope, tested a pine anchor, and hauled him out. The anchor check showed `3 + 6 + Perception 2 + Hauling Experience 1 = 12`, success. The rescue check showed `4 + 1 + Body 1 + Hauling Experience 1 + Situation 1 = 8`, success with a cost: the rope was damaged and Yohn's injuries worsened. Traveler watched the slope from safe ground, then supplied cloth and stabilized Yohn's arm; Paimon went for help. The rescue depended on the PC's choices and courier skills.
5. Yohn reported a long cry from the north, an unstable winged shadow, and four dark-cloaked people carrying a black, red-edged fragment north along an old stone stair. His sight of the figures and object was limited. Traveler shared a report of a previous patrol hearing a dragon cry and encountering similar gray; Jean had withdrawn routine patrols from the route. The distinction between testimony, Traveler's secondhand information, and confirmed cause was mostly preserved.
6. The Knights' party and a physician arrived, took Yohn and the sample, and Jean assigned Linchuan to guide Traveler to the perimeter. At the night meeting, Traveler was present and active in the exchange. Venti identified the dragon as Dvalin and described the fragment as resembling Abyss corruption, but explicitly said there was not yet proof that the cloaked group belonged to the Abyss Order. He set an actionable field test: look for recent prints, drag marks, or matching fragments on the old stone steps. The next morning's objective followed from evidence already collected; the player did not have to ask out of character for the main plot to resume.

## Findings and open issues

- **Promising:** the pacing had more depth than a quick summary but did not remain in unrelated errands. Each major scene changed what the party knew or could do. Traveler participated in combat, rescue, information sharing, and planning while the PC remained the decision-maker and performed the key evidence and rescue actions.
- **Unresolved combat state contradiction:** combat round 2 publicly reported one hilichurl at HP 0 and “倒地”; the round 4 close said the fallen one was alive but incapacitated. The story cannot establish both without an explicit rule explaining HP 0. Treat this as a consistency defect to fix or clarify.
- **Unexplained HP recovery:** Traveler went from 84/105 after combat to 94/105 during later investigation, then 94→104 during the rescue scene, without a clearly narrated healing action or a consistent rest settlement. The later return to Mondstadt explicitly logged a short rest and 104→105. Audit the earlier two increases before treating them as valid recovery.
- **Difficulty calibration candidate:** hauling an injured adult one-handed through a winding crevice was rated ordinary difficulty with a +1 situation modifier. It succeeded with a cost, but the difficulty tier may be too low for the stated physical risk; compare against the written difficulty rubric.
- **Check-card behavior uncertain:** an earlier “暂不检定” response was followed by a renewed card for a similar objective; the situation was eventually resolved by rolling. The test did not isolate whether this was duplicate model tool use or intended re-evaluation.
- **Dice animation:** screenshots did not show a distinct rolling animation. Public check results did show actual dice faces and modifiers in text. This was a visual observation, not a diagnosis of the animation feature.
- **Chapter not yet accepted:** no field confirmation of Abyss Order activity, no Stormterror's Lair conflict, no purification, and no aftermath have been played. This test does not establish that the complete Mondstadt mainline works.

## Verification

Observed directly in the DSH desktop conversation, not through a browser or demo. `trpg_char opening` loaded the current GM and mainline instructions before creating the new slot. No old save was accessed or deleted. The test is intentionally left in progress at the church-night scene for continuation from the same new slot.
