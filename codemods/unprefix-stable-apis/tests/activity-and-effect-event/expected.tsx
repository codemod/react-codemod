import { useEffect, Activity, useEffectEvent } from "react";

export function Chat({ roomId, visible, onVisit }) {
  const onConnected = useEffectEvent(() => {
    onVisit(roomId);
  });

  useEffect(() => {
    onConnected();
  }, [roomId]);

  return (
    <Activity mode={visible ? "visible" : "hidden"}>
      <p>{roomId}</p>
    </Activity>
  );
}
