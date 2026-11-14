# Spectral spider animation rig

The assembled character is `../spectral-spider.svg`. The independent web is `../spider-web.svg`. All files have a transparent background and a 640 × 640 viewBox. Individual parts retain the same coordinates so they can be stacked without repositioning.

The violet shading follows the lantern ghost and umbrella ghost. The character has a separate rounded abdomen and head, eight legs, and two eyes.

| Group ID | Animation use |
| --- | --- |
| `spider` | Translate or rotate the whole character around 320, 290 |
| `abdomen` | Body movement around 320, 257 |
| `head` | Head tilt around 320, 313 |
| `leg-L1` through `leg-L4` | Left leg roots, from front to rear |
| `leg-R1` through `leg-R4` | Mirrored right leg roots |
| `leg-L1-upper`, `leg-L1-lower` | Independent upper and lower joints, repeated for all eight legs |
| `eyelid-L`, `eyelid-R` | Scale vertically to close the left or right eye |
| `iris-L`, `iris-R` | Translate a few units to look around |
| `spectral-silk` | Secondary cloth movement or fade |
| `web-thread` | Draw the suspension strand |
| `web-spoke-1` through `web-spoke-8` | Draw independent spokes in the web asset |
| `web-ring-1` through `web-ring-4` | Draw the curved silk rings |

Each joint carries a `data-pivot` in its own coordinate system. The leg roots and knees have static translation wrappers. Animate the upper or lower joint inside its wrapper so the attachment stays in place. Right legs inherit mirroring from their roots.

Inline the assembled SVG to access its groups. This example bends one knee and closes the left eye.

```js
const knee = svg.querySelector('#leg-L1-lower');
knee.setAttribute('transform', 'rotate(15 0 0)');

const eyelid = svg.querySelector('#eyelid-L');
eyelid.setAttribute('transform', 'translate(299 333) scale(1 .05) translate(-299 -333)');
```

All web paths use `pathLength="1"`. Set `stroke-dasharray="1"` and animate `stroke-dashoffset` from 1 to 0 to draw a strand. Reverse this to retract it.

When embedding multiple copies inline, prefix their IDs and URL references to keep gradients and eye clips independent. The standalone part files work as images for composition, while inline SVG gives access to the joints. Motion can be added for each interaction, with a reduced-motion alternative.
