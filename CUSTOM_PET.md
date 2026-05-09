# Customizing Your Pencil-Pet

You can customize your pet's appearance by generating or providing images for different states. This project is optimized for high-quality, transparent-background pet images.

## Using Image Generation Prompts

Refer to `scripts/optimized_pet_prompts.md` for detailed prompts to generate consistent and high-quality pet assets.

### Key States and Mappings

Below is how the optimized prompts map to the states in Pencil-Pet:

| Concept | Pencil-Pet State | Recommended Filename |
|----------------|------------------|----------------------|
| **Rest Loaf** | `resting` | `resting.png` |
| **Rest Side** | `sleeping` | `sleeping.png` |
| **Neutral Stand** | `waiting` / `idle` | `stay.png` |
| **Held/Lifted** | `held` | `held.png` |
| **Transition Stretch** | `stretching` | `stretching.png` |
| **Walk Cycle** | `runningLeft` / `runningRight` | `walk.png` (or frames) |
| **Focused Action** | `working` / `thinking` | `work.png` |

## Asset Organization

Place your images in the `Pencil-Pet/assets` directory. The application supports PNG (with transparency) and JPG.

If you generate new images, you can update the mapping in `Pencil-Pet/src/main/main.ts`:

```typescript
export const PET_STATE_IMAGES: Record<PetState, string> = {
  idle: "stay.png",
  resting: "resting.png",
  sleeping: "sleeping.png",
  thinking: "work.png",
  working: "work.png",
  happy: "play.png",
  // ...
};
```

## State Classification

Pencil-Pet automatically monitors your `nanoPencil` sessions and classifies activity into states:

- **Thinking/Working**: Triggered when nanoPencil is generating an assistant message or running a tool.
- **Waiting**: Triggered when the agent needs your input (review, permission, choice).
- **Happy**: Triggered when a task is completed.
- **Resting/Sleeping**: Triggered automatically after periods of inactivity.
- **Stretching**: Can be triggered during transitions or after long working sessions.

## Support for Animations

Currently, the app displays static images. If you have generated walk cycles (multiple frames), stay tuned for updates to the renderer to support frame-by-frame animation!
