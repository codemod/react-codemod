import { useEffect, unstable_Activity, experimental_useEffectEvent } from "react";

export function Chat({ roomId, visible, onVisit }) {
  const onConnected = experimental_useEffectEvent(() => {
    onVisit(roomId);
  });

  useEffect(() => {
    onConnected();
  }, [roomId]);

  return (
    <unstable_Activity mode={visible ? "visible" : "hidden"}>
      <p>{roomId}</p>
    </unstable_Activity>
  );
}
