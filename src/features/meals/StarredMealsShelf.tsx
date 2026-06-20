import { useNavigate } from 'react-router-dom';
import { Coffee, Cookie, Moon, Plus, Star, Sun, type LucideProps } from 'lucide-react';
import { useMealsWithTotals } from './useMealsWithTotals';
import { mealCategories } from './mealCategory';
import { formatKcal } from '@/lib/macros';
import type { Meal } from '@/db/types';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

type LucideIcon = ForwardRefExoticComponent<LucideProps & RefAttributes<SVGSVGElement>>;

const CAT_ICON: Record<string, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

const CAT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function mealPrimaryCategory(meal: Meal): string {
  const cats = mealCategories(meal);
  return cats[0] ?? 'snack';
}

interface StarredMealsShelfProps {
  onLog: (meal: Meal) => void;
}

export function StarredMealsShelf({ onLog }: StarredMealsShelfProps) {
  const navigate = useNavigate();
  const meals = useMealsWithTotals();
  const starred = (meals ?? []).filter((m) => m.meal.favorite);

  if (starred.length === 0) return null;

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 22px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Star
            size={12}
            strokeWidth={0}
            style={{ fill: 'var(--color-accent)', color: 'var(--color-accent)' }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--color-accent)',
              textTransform: 'uppercase',
            }}
          >
            Starred
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
          {starred.length} {starred.length === 1 ? 'meal' : 'meals'}
        </span>
      </div>

      {/* Horizontal scroll */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: 11,
          overflowX: 'auto',
          paddingLeft: 22,
          paddingRight: 22,
          paddingBottom: 16,
        }}
      >
        {starred.map(({ meal, totals }) => {
          const cat = mealPrimaryCategory(meal);
          const CatIcon = CAT_ICON[cat] ?? Cookie;
          const AmbientIcon = CAT_ICON[cat] ?? Cookie;

          return (
            <button
              key={meal.id}
              type="button"
              onClick={() => onLog(meal)}
              style={{
                flexShrink: 0,
                width: 122,
                borderRadius: 17,
                background: 'var(--color-hero)',
                padding: '15px 13px 13px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                border: 'none',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              {/* Ambient icon */}
              <div
                style={{
                  position: 'absolute',
                  right: -10,
                  bottom: -12,
                  opacity: 0.07,
                  color: 'var(--color-hero-text)',
                  pointerEvents: 'none',
                }}
              >
                <AmbientIcon size={82} strokeWidth={0.8} />
              </div>

              {/* Icon circle */}
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'rgba(191,146,72,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                  flexShrink: 0,
                }}
              >
                <CatIcon size={15} strokeWidth={1.5} style={{ color: 'var(--color-accent-deep)' }} />
              </div>

              {/* Category label */}
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  color: 'var(--color-accent)',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {CAT_LABEL[cat] ?? 'Meal'}
              </div>

              {/* Meal name */}
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: '-0.015em',
                  lineHeight: 1.3,
                  color: 'var(--color-hero-text)',
                  marginBottom: 10,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  flex: 1,
                }}
              >
                {meal.name}
              </div>

              {/* Kcal row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 200,
                    letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-accent-deep)',
                    lineHeight: 1,
                  }}
                >
                  {formatKcal(totals.kcal)}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    color: 'var(--color-accent)',
                    textTransform: 'uppercase',
                  }}
                >
                  kcal
                </span>
              </div>
            </button>
          );
        })}

        {/* New meal placeholder */}
        <button
          type="button"
          onClick={() => navigate('/meals/new')}
          style={{
            flexShrink: 0,
            width: 84,
            borderRadius: 17,
            border: '1.5px dashed var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            background: 'transparent',
            fontFamily: 'inherit',
            minHeight: 160,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: 'var(--color-thumb-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={16} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              lineHeight: 1.3,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            New meal
          </span>
        </button>
      </div>
    </div>
  );
}
