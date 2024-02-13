import style from "./common.module.scss";
import cls from "classnames";

export const Box = (
  props: React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  >
) => <div {...props} className={cls(style.box, props.className)} />;
