"use client";

import { ADDONS, CLUES, CLUE_IDS, COMMS, ENGINES, EVENTS, EVENT_IDS, HULLS, HYPOTHESES, KIT, POWER, SENSORS, SETTLEMENTS, SETTLEMENT_IDS, SHIELDS, ZONES, ZONE_ORDER } from "@/lib/game";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");

const TAG = { real: "REAL", game: "GAME VALUE", fiction: "FICTION" } as const;

/** The game's data, laid open. Every row is a line of data in the code, and every row says where it comes from. */
export default function Rules() {
  const parts =
    Object.keys(ENGINES).length +
    Object.keys(POWER).length +
    Object.keys(SHIELDS).length +
    Object.keys(SENSORS).length +
    Object.keys(COMMS).length +
    Object.keys(KIT).length +
    Object.keys(ADDONS).length;
  return (
    <section className="lb-sec" id="rules" aria-labelledby="rules-title">
      <header className="lb-sec-head">
        <p className="eyebrow">
          06 <b>{"//"}</b> The rules, in the open
        </p>
        <h2 className="display" id="rules-title">
          It&apos;s all <em>just data.</em>
        </h2>
        <p>
          Hulls, parts, event cards, zones and clues are plain rows in the code. A new part or card is a new row. Open any table to read it.
        </p>
      </header>

      <div className="lb-rules">
        <details>
          <summary>
            <b>3 hulls</b> <span>{parts} parts across seven slots</span>
          </summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Hull</th>
                <th scope="col">Core mass</th>
                <th scope="col">Max fuel</th>
                <th scope="col">Bay</th>
                <th scope="col">Sensor slots</th>
                <th scope="col">Cost</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(HULLS).map((h) => (
                <tr key={h.id}>
                  <th scope="row">
                    {h.name} <small>{h.tagline}</small>
                  </th>
                  <td>{r0(h.coreKg)} kg</td>
                  <td>{r0(h.maxFuelKg)} kg</td>
                  <td>{r0(h.bayLimitKg)} kg</td>
                  <td>{h.sensorSlots}</td>
                  <td>{h.cost} cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <details>
          <summary>
            <b>{EVENT_IDS.length} event cards</b> <span>three are drawn each flight, and the distress call is always one</span>
          </summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Card</th>
                <th scope="col">Choices</th>
                <th scope="col">What it teaches</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {EVENT_IDS.map((id) => {
                const c = EVENTS[id];
                return (
                  <tr key={id}>
                    <th scope="row">{c.title}</th>
                    <td>{c.choices.map((x) => x.label).join(" · ")}</td>
                    <td>{c.teaches}</td>
                    <td>
                      <i className={`hg-tag ${c.source}`}>{TAG[c.source]}</i>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>

        <details>
          <summary>
            <b>Lantern 17</b> <span>six zones, six clues and three explanations</span>
          </summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col">What is there</th>
                <th scope="col">Hazard</th>
              </tr>
            </thead>
            <tbody>
              {ZONE_ORDER.map((id) => (
                <tr key={id}>
                  <th scope="row">{ZONES[id].name}</th>
                  <td>{ZONES[id].what}</td>
                  <td>{ZONES[id].hazard}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th scope="col">Clue</th>
                <th scope="col">Found with</th>
                <th scope="col">Points</th>
                <th scope="col">What it shows</th>
              </tr>
            </thead>
            <tbody>
              {CLUE_IDS.map((id) => (
                <tr key={id}>
                  <th scope="row">
                    {id} {CLUES[id].name}
                  </th>
                  <td>{CLUES[id].foundWith}</td>
                  <td>{CLUES[id].points}</td>
                  <td>{CLUES[id].shows}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="lb-hyp">
            {Object.values(HYPOTHESES).map((h) => (
              <li key={h.id}>
                <b>
                  {h.id} · {h.name}
                </b>
                <span>{h.ruledOutBy}</span>
              </li>
            ))}
          </ul>
        </details>

        <details>
          <summary>
            <b>4 settlements</b> <span>their reserves drain by the light they are missing</span>
          </summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Settlement</th>
                <th scope="col">Reserve</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {SETTLEMENT_IDS.map((id) => (
                <tr key={id}>
                  <th scope="row">{SETTLEMENTS[id].name}</th>
                  <td>{SETTLEMENTS[id].reserveH} h</td>
                  <td>{SETTLEMENTS[id].note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
