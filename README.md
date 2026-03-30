## Inspiration
Air traffic control is a high-pressure job, made harder by chronic understaffing and limited funding—around $20–22 billion annually for the FAA system. The shortage traces back in part to the PATCO strike of 1981, after which the workforce took decades to rebuild and still hasn’t fully recovered.

Recent incidents have shown how short staffing and heavy workloads can increase risk, especially when controllers are handling multiple responsibilities at once. We wanted to create a tool that helps controllers stay ahead of traffic, reduce stress, and minimize errors—because in aviation, every second matters.

## What it does
Smart ATC is an AI companion that aids air traffic controllers by reducing workload, providing real-time traffic advisories, and departure/arrival sequencing recommendations for optimal efficiency. It acts like an extra set of eyes in the tower, helping controllers manage multiple flights efficiently while maintaining safety. We've seen how powerful AI can be as a coding partner, business strategist, and marketing assistant - fields where the AI boom has already made a huge impact - it's super exciting to imagine how groundbreaking it could be in air traffic control.

## How we built it
For this project, we knew we wanted to incorporate AI into air traffic control. We used flight data from OpenSky's API as it had good documentations and decent rate limits for polling real-time data. While playing around with the API, we realized that there's a ton of data that is included in it such as an aircraft's ground track, compass heading, groundspeed just to name a few. All of this data allowed us to create an algorithm that predicted possible collision advisories. Outside of this data, we also integrated AI to assist ATC with suggesting certain instructions to the pilots since it was able to work on data from all of these different flights allowing for less cognitive load on the ATC agents. To polish our work, we used some generative ai to incorporate the algorithmic and ai side of the app.

## Challenges we ran into
The biggest challenge we ran into was OpenSky's rate limit. Initially when we built this, we forgot that there may be rate limits to their API. We didn't realize there were limits until a couple hours into prototyping, but by then we had already used a huge chunk of our rates. This was a significant challenge because if we used all of our API rates we would not be able to pull any more flight data and the app would essentially stop working without the core resource. To fix this issue, we added a bigger refresh limits and manual refreshing. Prior to this we had the app refreshing flight data every 5 seconds which killed our rates. Now, when the app loads the refreshing setting is set to manual and auto refreshing is set to 2 ticks a minute.

## Accomplishments that we're proud of
We successfully created a working prototype that can track multiple aircraft simultaneously, provide traffic collision avoidance, identify potential conflicts, and suggest sequencing adjustments. Our interface is simple and clear, and the AI recommendations are fast enough to be useful in real-time operations.

## What we learned
We learned a lot about the complexities of air traffic control, including how humans make split-second decisions and how AI can complement that process. We also gained experience integrating AI with real-world data streams and designing a user-friendly interface under tight constraints.

## What's next for Smart ATC
Next, we plan to enhance the AI with predictive analytics to anticipate traffic congestion and improve sequencing suggestions. Sequencing is crucial because it determines the order in which aircraft land or take off, balancing safety, efficiency, and spacing; an AI can assist far more effectively than relying on mental memory and on-the-fly decisions, quickly analyzing multiple variables and providing optimal recommendations. We also want to refine the system and gain insight from real controllers. Our end-goal is to make an ATC-oriented product that is aimed to reduce workload, provide additional situational awareness, and improve safety standards.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional environment variables:

- `OPENSKY_CLIENT_ID`
- `OPENSKY_CLIENT_SECRET`
- `FLIGHT_REFRESH_INTERVAL_MS`
- `REGISTRY_LOOKUPS_PER_REQUEST`
