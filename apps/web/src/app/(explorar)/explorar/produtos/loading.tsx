import { PostCarregando } from "../../../../features/feed/Post.tsx";
import "../../../../features/feed/feed.css";

/** Enquanto o feed chega (card #49): bolinhas e um post na forma final. */
export default function CarregandoOsPosts() {
  return (
    <main className="sc-feed" data-aba="produtos" aria-busy="true">
      <p className="sc-feed__oculto" role="status">
        Carregando o feed…
      </p>
      <div className="sc-stories sc-stories--carregando" aria-hidden="true">
        <ul className="sc-stories__fileira">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <span className="sc-stories__bolinha">
                <span className="sc-stories__anel" />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <PostCarregando />
    </main>
  );
}
