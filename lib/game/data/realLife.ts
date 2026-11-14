/**
 * "In real life" cards for the debrief: each part the player flew, linked to real hardware.
 * Handbook page 20 and the research table on page 22.
 */
export interface RealCard {
  key: string;
  label: string;
  real: string;
  note: string;
}

export const REAL: Record<string, RealCard> = {
  biprop: { key: "biprop", label: "Your engine", real: "AJ10", note: "Flew on the Apollo service module, the Shuttle and Orion." },
  cluster: { key: "cluster", label: "Your engine", real: "R-4D", note: "Small thrusters used for decades on spacecraft and the ATV." },
  green: { key: "green", label: "Your engine", real: "ASCENT", note: "NASA's green monopropellant, flown on GPIM in 2019." },
  cryo: { key: "cryo", label: "Your engine", real: "RL10", note: "Liquid hydrogen and oxygen. The most efficient chemical upper stage." },
  fuelcells: { key: "fuelcells", label: "Your power", real: "Shuttle fuel cells", note: "Made the crew's drinking water as a by-product." },
  battery: { key: "battery", label: "Your power", real: "Space Li-ion", note: "Space-rated modules hold about 125–150 Wh per kg." },
  reactor: { key: "reactor", label: "Your power", real: "Kilopower", note: "NASA's small fission reactor, ground-tested in 2018." },
  light: { key: "light", label: "Your shield", real: "ISS Whipple", note: "Layered bumpers that shatter debris before it reaches the hull." },
  heavy: { key: "heavy", label: "Your shield", real: "Stuffed Whipple", note: "ISS shields with Nextel and Kevlar layers for bigger debris." },
  camera: { key: "camera", label: "Your camera", real: "OSIRIS-REx cameras", note: "0.6 kg and 5.3 W each." },
  thermal: { key: "thermal", label: "Your heat camera", real: "TriDAR thermal imager", note: "Flew on three Shuttle missions." },
  lidar: { key: "lidar", label: "Your lidar", real: "TriDAR", note: "Worked from 0.5 m to over 2 km for docking." },
  radar: { key: "radar", label: "Your radar", real: "Doppler tracking", note: "Reads speed changes of millimetres per second." },
  laser: { key: "laser", label: "Your laser link", real: "NASA DSOC", note: "Sent 267 Mbps from about 30 million km on Psyche." },
  radio: { key: "radio", label: "Your radio", real: "IRIS transponder", note: "Small deep-space radios flown on CubeSats." },
  eva: { key: "eva", label: "Your suits", real: "NASA EMU", note: "About 8.5 h of air, including a 30-minute reserve." },
  drones: { key: "drones", label: "Your drones", real: "AERCam Sprint", note: "A 35 lb free-flying camera ball, flown on STS-87 in 1997." },
  arm: { key: "arm", label: "Your arm", real: "Canadarm3", note: "8.5 m, built for the Lunar Gateway." },
  optics: { key: "optics", label: "Your mirror", real: "JWST segments", note: "18 hexagons, each aimed and reshaped by its own motors." },
  rtg: { key: "rtg", label: "Your heat brick", real: "MMRTG", note: "Powers Curiosity and Perseverance. About $109 M to build and deploy." },
  jetpack: { key: "jetpack", label: "Your jetpack", real: "SAFER", note: "An emergency rescue jetpack, about 3 m/s in total." },
  beam: { key: "beam", label: "Your beam", real: "DART, without contact", note: "DART moved an asteroid by hitting it. You did it with light." },
  ablation: { key: "ablation", label: "Your push", real: "Laser ablation", note: "Measured in the lab by Gibbings et al. (2013)." },
};
